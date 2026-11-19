import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentStatus, FollowupKind } from "../domain/types";
import { useRecoveryContext } from "./context";

// --- domain ---------------------------------------------------------------------------------

export type PatientAppointment = {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  treatment: string | null;
  estimatedValue: number;
};

export type PatientFollowup = {
  id: string;
  kind: FollowupKind;
  procedure: string;
  dueOn: string;
  estimatedValue: number;
  done: boolean;
};

export type Patient = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  lastVisitAt: string | null;
  createdAt: string;
  appointments: PatientAppointment[];
  followups: PatientFollowup[];
};

export type EnquirySource = "whatsapp" | "phone" | "web_form" | "walk_in" | "other";

export type NewAppointment = { startsAt: Date; treatment: string; estimatedValue: number; durationMinutes?: number };
export type NewFollowup = { kind: FollowupKind; procedure: string; dueOn: string; estimatedValue: number };

export type NewPatient = {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  whatsappConsent: boolean;
  appointment: NewAppointment | null;
  followup: NewFollowup | null;
};

/** Accepts what people actually type ("98765 43210", "+91-98765-43210") and returns E.164, or null. */
export const normalizePhone = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`; // an Indian mobile typed without the country code
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
};

// --- raw rows -------------------------------------------------------------------------------

type Num = number | string;
type RawPatient = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  last_visit_at: string | null;
  created_at: string;
  appointments: { id: string; starts_at: string; status: AppointmentStatus; treatment: string | null; estimated_value: Num }[];
  planned_followups: {
    id: string;
    kind: FollowupKind;
    procedure: string;
    due_on: string;
    estimated_value: Num;
    completed_at: string | null;
    booked_appointment_id: string | null;
  }[];
};

const toPatient = (raw: RawPatient): Patient => ({
  id: raw.id,
  fullName: raw.full_name,
  phone: raw.phone,
  email: raw.email,
  notes: raw.notes,
  lastVisitAt: raw.last_visit_at,
  createdAt: raw.created_at,
  appointments: raw.appointments
    .map((a) => ({ id: a.id, startsAt: a.starts_at, status: a.status, treatment: a.treatment, estimatedValue: Number(a.estimated_value) }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  followups: raw.planned_followups
    .map((f) => ({
      id: f.id,
      kind: f.kind,
      procedure: f.procedure,
      dueOn: f.due_on,
      estimatedValue: Number(f.estimated_value),
      done: f.completed_at !== null || f.booked_appointment_id !== null,
    }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
});

const PATIENT_COLUMNS =
  "id, full_name, phone, email, notes, last_visit_at, created_at, " +
  "appointments(id, starts_at, status, treatment, estimated_value), " +
  "planned_followups(id, kind, procedure, due_on, estimated_value, completed_at, booked_appointment_id)";

const explain = (error: PostgrestError, action: string): Error => {
  if (error.code === "42501")
    return new Error(error.message.startsWith("This number") ? error.message : `You don't have permission to ${action}.`);
  if (error.code === "23514") return new Error(`Could not ${action}: please check the dates and amounts.`);
  return new Error(`Could not ${action}: ${error.message}`);
};

// --- queries --------------------------------------------------------------------------------

export const usePatients = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "patients", clinicId],
    queryFn: async (): Promise<Patient[]> => {
      const { data, error } = await supabase
        .schema("recovery")
        .from("patients")
        .select(PATIENT_COLUMNS)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw explain(error, "load patients");
      return (data as unknown as RawPatient[]).map(toPatient);
    },
  });
};

// --- mutations ------------------------------------------------------------------------------

const useRecoveryMutation = <Input>(run: (ctx: { supabase: SupabaseClient; clinicId: string }, input: Input) => Promise<void>) => {
  const { supabase, clinicId } = useRecoveryContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => run({ supabase, clinicId }, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recovery"] }),
  });
};

const appointmentRow = (clinicId: string, patientId: string, appointment: NewAppointment) => ({
  clinic_id: clinicId,
  patient_id: patientId,
  starts_at: appointment.startsAt.toISOString(),
  ends_at: new Date(appointment.startsAt.getTime() + (appointment.durationMinutes ?? 30) * 60_000).toISOString(),
  treatment: appointment.treatment.trim() || null,
  estimated_value: Math.max(0, appointment.estimatedValue),
  source: "front_desk",
});

const followupRow = (clinicId: string, patientId: string, followup: NewFollowup) => ({
  clinic_id: clinicId,
  patient_id: patientId,
  kind: followup.kind,
  procedure: followup.procedure.trim(),
  due_on: followup.dueOn,
  estimated_value: Math.max(0, followup.estimatedValue),
});

export const useAddPatient = () =>
  useRecoveryMutation<NewPatient>(async ({ supabase, clinicId }, input) => {
    const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
    if (input.phone.trim() && !phone) throw new Error("That phone number doesn't look complete. Include the country code, e.g. +91.");
    const db = supabase.schema("recovery");

    // A patient's own STOP wins over the tick box; say so before anything is saved.
    if (phone && input.whatsappConsent) {
      const stopped = await db
        .from("consents")
        .select("source")
        .eq("clinic_id", clinicId)
        .eq("contact_phone", phone)
        .eq("status", "opted_out")
        .in("source", ["whatsapp_reply_stop", "erasure_request"])
        .limit(1);
      if (stopped.data && stopped.data.length > 0)
        throw new Error(
          "This number asked not to get WhatsApp messages. Untick the WhatsApp box to add the patient; only they can turn messages back on, by replying START.",
        );
    }

    const { data, error } = await db
      .from("patients")
      .insert({
        clinic_id: clinicId,
        full_name: input.fullName.trim(),
        phone,
        email: input.email.trim() || null,
        notes: input.notes.trim() || null,
      })
      .select("id")
      .single();
    if (error) throw explain(error, "add the patient");
    const patientId = (data as { id: string }).id;

    if (phone) {
      const consent = await db.from("consents").upsert(
        {
          clinic_id: clinicId,
          contact_phone: phone,
          channel: "whatsapp",
          status: input.whatsappConsent ? "opted_in" : "opted_out",
          source: "added_by_staff",
          recorded_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id,contact_phone,channel" },
      );
      if (consent.error) throw explain(consent.error, "save the WhatsApp permission");
    }
    if (input.appointment) {
      const result = await db.from("appointments").insert(appointmentRow(clinicId, patientId, input.appointment));
      if (result.error) throw explain(result.error, "add the appointment");
    }
    if (input.followup) {
      const result = await db.from("planned_followups").insert(followupRow(clinicId, patientId, input.followup));
      if (result.error) throw explain(result.error, "plan the next visit");
    }
  });

export const useUpdatePatient = () =>
  useRecoveryMutation<{ id: string; fullName: string; phone: string; email: string; notes: string }>(
    async ({ supabase }, input) => {
      const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
      if (input.phone.trim() && !phone) throw new Error("That phone number doesn't look complete. Include the country code, e.g. +91.");
      const { error } = await supabase
        .schema("recovery")
        .from("patients")
        .update({ full_name: input.fullName.trim(), phone, email: input.email.trim() || null, notes: input.notes.trim() || null })
        .eq("id", input.id);
      if (error) throw explain(error, "save the patient");
    },
  );

export const useDeletePatient = () =>
  useRecoveryMutation<string>(async ({ supabase }, id) => {
    const { data, error } = await supabase.schema("recovery").from("patients").delete().eq("id", id).select("id");
    if (error) throw explain(error, "delete the patient");
    // Row Level Security hides rows instead of failing, so nothing deleted means not allowed.
    if (!data || data.length === 0) throw new Error("Only owners and managers can delete a patient.");
  });

export const useAddAppointment = () =>
  useRecoveryMutation<{ patientId: string; appointment: NewAppointment }>(async ({ supabase, clinicId }, input) => {
    const { error } = await supabase
      .schema("recovery")
      .from("appointments")
      .insert(appointmentRow(clinicId, input.patientId, input.appointment));
    if (error) throw explain(error, "add the appointment");
  });

export const useSetAppointmentStatus = () =>
  useRecoveryMutation<{ id: string; patientId: string; status: AppointmentStatus }>(async ({ supabase }, input) => {
    const db = supabase.schema("recovery");
    const now = new Date().toISOString();
    const { error } = await db
      .from("appointments")
      .update({ status: input.status, ...(input.status === "confirmed" ? { confirmed_at: now } : {}) })
      .eq("id", input.id);
    if (error) throw explain(error, "update the appointment");
    if (input.status === "completed") {
      const visit = await db.from("patients").update({ last_visit_at: now }).eq("id", input.patientId);
      if (visit.error) throw explain(visit.error, "record the visit");
    }
  });

export const useAddFollowup = () =>
  useRecoveryMutation<{ patientId: string; followup: NewFollowup }>(async ({ supabase, clinicId }, input) => {
    const { error } = await supabase
      .schema("recovery")
      .from("planned_followups")
      .insert(followupRow(clinicId, input.patientId, input.followup));
    if (error) throw explain(error, "plan the next visit");
  });

export const useCompleteFollowup = () =>
  useRecoveryMutation<string>(async ({ supabase }, id) => {
    const { error } = await supabase
      .schema("recovery")
      .from("planned_followups")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw explain(error, "mark it done");
  });

export type NewEnquiry = { contactName: string; contactPhone: string; source: EnquirySource; message: string };

export const useLogEnquiry = () =>
  useRecoveryMutation<NewEnquiry>(async ({ supabase, clinicId }, input) => {
    const phone = normalizePhone(input.contactPhone);
    if (!phone) throw new Error("Please enter a full phone number with the country code, e.g. +91.");
    const { error } = await supabase
      .schema("recovery")
      .from("enquiries")
      .insert({
        clinic_id: clinicId,
        contact_name: input.contactName.trim() || null,
        contact_phone: phone,
        source: input.source,
        message: input.message.trim() || null,
        received_at: new Date().toISOString(),
      });
    if (error) throw explain(error, "save the enquiry");
  });

export const useAddCallback = () =>
  useRecoveryMutation<{ patientId: string | null; title: string; dueAt: Date }>(async ({ supabase, clinicId }, input) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .schema("recovery")
      .from("staff_tasks")
      .insert({
        clinic_id: clinicId,
        patient_id: input.patientId,
        kind: "callback",
        title: input.title.trim(),
        due_at: input.dueAt.toISOString(),
        created_by: auth.user?.id ?? null,
        assigned_to: auth.user?.id ?? null,
      });
    if (error) throw explain(error, "save the call back");
  });
