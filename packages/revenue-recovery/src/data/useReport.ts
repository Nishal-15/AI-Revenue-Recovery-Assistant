import { useQuery } from "@tanstack/react-query";
import type { BookingRule, LeakReport, RecoveredBooking, ReportPeriod, ReportSummary } from "../domain/reports";
import { periodRange } from "../domain/reports";
import type { LeakType } from "../domain/types";
import { useRecoveryContext } from "./context";
import { buildDemoReport } from "./demoReport";

// Shape returned by recovery.report_summary(); numerics may arrive as strings.
type Num = number | string;
type RawReport = {
  recovered_value: Num;
  recovered_bookings: number;
  new_bookings: number;
  saved_appointments: number;
  items_found: Num;
  items_recovered: number;
  items_lost: number;
  recovery_rate: Num;
  auto_resolved: number;
  messages: {
    sent: number;
    automated: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    received: number;
    ai_read: number;
  };
  by_leak: { leak_type: LeakType; found: number; recovered: number; lost: number; bookings: number; recovered_value: Num }[];
  bookings: {
    id: string;
    booked_at: string;
    value: Num;
    rule: BookingRule;
    leak_type: LeakType | null;
    patient_name: string | null;
    treatment: string | null;
    starts_at: string;
    template_name: string | null;
    automated: boolean;
  }[];
};

const toLeakReport = (raw: RawReport["by_leak"][number]): LeakReport => ({
  leakType: raw.leak_type,
  found: raw.found,
  recovered: raw.recovered,
  lost: raw.lost,
  bookings: raw.bookings,
  recoveredValue: Number(raw.recovered_value),
});

const toBooking = (raw: RawReport["bookings"][number]): RecoveredBooking => ({
  id: raw.id,
  bookedAt: raw.booked_at,
  value: Number(raw.value),
  rule: raw.rule,
  leakType: raw.leak_type,
  patientName: raw.patient_name ?? "Unknown patient",
  treatment: raw.treatment ?? "Appointment",
  startsAt: raw.starts_at,
  templateName: raw.template_name,
  automated: raw.automated,
});

const toReport = (raw: RawReport): ReportSummary => ({
  recoveredValue: Number(raw.recovered_value),
  recoveredBookings: raw.recovered_bookings,
  newBookings: raw.new_bookings,
  savedAppointments: raw.saved_appointments,
  itemsFound: Number(raw.items_found),
  itemsRecovered: raw.items_recovered,
  itemsLost: raw.items_lost,
  recoveryRate: Number(raw.recovery_rate),
  autoResolved: raw.auto_resolved,
  messages: { ...raw.messages, aiRead: raw.messages.ai_read },
  byLeak: raw.by_leak.map(toLeakReport),
  bookings: raw.bookings.map(toBooking),
});

export const useReport = (period: ReportPeriod) => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "report", clinicId, supabase ? "live" : "demo", period],
    queryFn: async (): Promise<ReportSummary> => {
      if (!supabase) return buildDemoReport(period);
      const { from, to } = periodRange(period);
      const { data, error } = await supabase
        .schema("recovery")
        .rpc("report_summary", { p_clinic_id: clinicId, p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw new Error(`Could not load the report: ${error.message}`);
      return toReport(data as RawReport);
    },
  });
};
