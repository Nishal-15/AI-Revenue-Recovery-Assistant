import { useQuery } from "@tanstack/react-query";
import type { FollowupKind, OverdueFollowup } from "../domain/types";
import { toDateKey } from "../lib/format";
import { useRecoveryContext } from "./context";
import { demoStore } from "./demoStore";

type RawPatient = { full_name: string; phone: string | null; last_visit_at: string | null };

type RawFollowup = {
  id: string;
  kind: FollowupKind;
  procedure: string;
  due_on: string;
  estimated_value: number | string;
  // A many-to-one embed is an object, but older PostgREST typings describe it as an array.
  patient: RawPatient | RawPatient[] | null;
};

const firstPatient = (patient: RawFollowup["patient"]): RawPatient | null =>
  Array.isArray(patient) ? (patient[0] ?? null) : patient;

const toFollowup = (raw: RawFollowup): OverdueFollowup => {
  const patient = firstPatient(raw.patient);
  return {
    id: raw.id,
    kind: raw.kind,
    procedure: raw.procedure,
    dueOn: raw.due_on,
    estimatedValue: Number(raw.estimated_value),
    patientName: patient?.full_name ?? "Unknown patient",
    patientPhone: patient?.phone ?? null,
    lastVisitAt: patient?.last_visit_at ?? null,
  };
};

/** Planned follow-ups that are past due and still neither booked nor completed. */
export const useRecalls = () => {
  const { supabase, clinicId } = useRecoveryContext();

  return useQuery({
    queryKey: ["recovery", "recalls", clinicId, supabase ? "live" : "demo"],
    queryFn: async (): Promise<OverdueFollowup[]> => {
      const today = toDateKey(new Date());

      if (!supabase) {
        const followups = await demoStore.listFollowups();
        return followups.filter((followup) => followup.dueOn < today);
      }

      const { data, error } = await supabase
        .schema("recovery")
        .from("planned_followups")
        .select("id, kind, procedure, due_on, estimated_value, patient:patients(full_name, phone, last_visit_at)")
        .eq("clinic_id", clinicId)
        .is("completed_at", null)
        .is("booked_appointment_id", null)
        .lt("due_on", today)
        .order("due_on", { ascending: true })
        .limit(1000);
      if (error) throw new Error(`Could not load overdue follow-ups: ${error.message}`);
      return (data as RawFollowup[]).map(toFollowup);
    },
  });
};
