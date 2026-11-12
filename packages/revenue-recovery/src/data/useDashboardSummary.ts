import { useQuery } from "@tanstack/react-query";
import { LEAK_TYPES, type DashboardSummary, type LeakType, type PriorityItem } from "../domain/types";
import { useRecoveryContext } from "./context";
import { buildDemoSummary } from "./demoSummary";

// Shape returned by the recovery.dashboard_summary() Postgres function.
type RawSummary = {
  recovered_value: number;
  recovered_previous_value: number;
  recovered_bookings: number;
  at_risk_value: number;
  recovery_rate: number;
  leaks: Partial<Record<LeakType, { open_count: number; at_risk_value: number }>>;
  weekly: { week_start: string; recovered_value: number }[];
  top_items: {
    id: string;
    leak_type: LeakType;
    patient_name: string | null;
    reason: string | null;
    estimated_value: number;
    priority_score: number;
    due_at: string | null;
  }[];
};

const toPriorityItem = (raw: RawSummary["top_items"][number]): PriorityItem => ({
  id: raw.id,
  leakType: raw.leak_type,
  patientName: raw.patient_name ?? "Unknown patient",
  reason: raw.reason ?? "",
  estimatedValue: Number(raw.estimated_value),
  priorityScore: Number(raw.priority_score),
  dueAt: raw.due_at,
});

const toSummary = (raw: RawSummary, currency: string): DashboardSummary => {
  const leaks = Object.fromEntries(
    LEAK_TYPES.map((type) => {
      const leak = raw.leaks[type];
      return [type, { openCount: leak?.open_count ?? 0, atRiskValue: Number(leak?.at_risk_value ?? 0) }];
    }),
  ) as DashboardSummary["leaks"];

  return {
    currency,
    recoveredValue: Number(raw.recovered_value),
    recoveredPreviousValue: Number(raw.recovered_previous_value),
    recoveredBookings: raw.recovered_bookings,
    atRiskValue: Number(raw.at_risk_value),
    recoveryRate: Number(raw.recovery_rate),
    leaks,
    weekly: raw.weekly.map((week) => ({ weekStart: week.week_start, recoveredValue: Number(week.recovered_value) })),
    topItems: raw.top_items.map(toPriorityItem),
  };
};

export const useDashboardSummary = () => {
  const { supabase, clinicId, currency } = useRecoveryContext();

  return useQuery({
    queryKey: ["recovery", "dashboard-summary", clinicId, supabase ? "live" : "demo"],
    queryFn: async (): Promise<DashboardSummary> => {
      if (!supabase) return buildDemoSummary(currency);
      const { data, error } = await supabase
        .schema("recovery")
        .rpc("dashboard_summary", { p_clinic_id: clinicId });
      if (error) throw new Error(`Could not load recovery summary: ${error.message}`);
      return toSummary(data as RawSummary, currency);
    },
  });
};
