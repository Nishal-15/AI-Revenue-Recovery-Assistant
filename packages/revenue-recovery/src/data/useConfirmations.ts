import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpcomingAppointment } from "../domain/types";
import { useRecoveryContext } from "./context";
import { demoStore } from "./demoStore";

/** How far ahead the confirmations list looks; matches the unconfirmed_appointment leak window. */
export const CONFIRMATION_WINDOW_HOURS = 72;

type RawPatient = { full_name: string; phone: string | null };

type RawAppointment = {
  id: string;
  starts_at: string;
  status: UpcomingAppointment["status"];
  treatment: string | null;
  estimated_value: number | string;
  // A many-to-one embed is an object, but older PostgREST typings describe it as an array.
  patient: RawPatient | RawPatient[] | null;
};

const firstPatient = (patient: RawAppointment["patient"]): RawPatient | null =>
  Array.isArray(patient) ? (patient[0] ?? null) : patient;

const toAppointment = (raw: RawAppointment): UpcomingAppointment => {
  const patient = firstPatient(raw.patient);
  return {
    id: raw.id,
    startsAt: raw.starts_at,
    status: raw.status,
    treatment: raw.treatment ?? "Appointment",
    estimatedValue: Number(raw.estimated_value),
    patientName: patient?.full_name ?? "Unknown patient",
    patientPhone: patient?.phone ?? null,
  };
};

const isInWindow = (appointment: UpcomingAppointment, from: number, to: number): boolean => {
  const startsAt = new Date(appointment.startsAt).getTime();
  return startsAt >= from && startsAt < to;
};

const useConfirmationsQueryKey = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return ["recovery", "confirmations", clinicId, supabase ? "live" : "demo"] as const;
};

export const useConfirmations = () => {
  const { supabase, clinicId } = useRecoveryContext();
  const queryKey = useConfirmationsQueryKey();

  return useQuery({
    queryKey,
    queryFn: async (): Promise<UpcomingAppointment[]> => {
      const from = Date.now();
      const to = from + CONFIRMATION_WINDOW_HOURS * 3_600_000;

      if (!supabase) {
        const appointments = await demoStore.listAppointments();
        return appointments
          .filter((appointment) => isInWindow(appointment, from, to))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }

      const { data, error } = await supabase
        .schema("recovery")
        .from("appointments")
        .select("id, starts_at, status, treatment, estimated_value, patient:patients(full_name, phone)")
        .eq("clinic_id", clinicId)
        .gte("starts_at", new Date(from).toISOString())
        .lt("starts_at", new Date(to).toISOString())
        .in("status", ["scheduled", "confirmed"])
        .order("starts_at", { ascending: true });
      if (error) throw new Error(`Could not load upcoming appointments: ${error.message}`);
      return (data as RawAppointment[]).map(toAppointment);
    },
  });
};

export const useConfirmAppointment = () => {
  const { supabase } = useRecoveryContext();
  const queryClient = useQueryClient();
  const queryKey = useConfirmationsQueryKey();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!supabase) return demoStore.confirmAppointment(id);
      const { error } = await supabase
        .schema("recovery")
        .from("appointments")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Could not confirm the appointment: ${error.message}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UpcomingAppointment[]>(queryKey);
      queryClient.setQueryData<UpcomingAppointment[]>(queryKey, (appointments) =>
        appointments?.map((appointment) =>
          appointment.id === id ? { ...appointment, status: "confirmed" } : appointment,
        ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recovery"] }),
  });
};
