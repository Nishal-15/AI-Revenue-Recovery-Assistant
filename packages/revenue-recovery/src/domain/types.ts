// Mirrors the enums in supabase/migrations/*_recovery_schema.sql. Keep the two in sync.
export const LEAK_TYPES = [
  "missed_enquiry",
  "overdue_followup",
  "unconfirmed_appointment",
  "lapsed_patient",
] as const;

export type LeakType = (typeof LEAK_TYPES)[number];

export type RecoveryItemStatus = "open" | "in_progress" | "recovered" | "lost" | "dismissed";

export type LeakSummary = {
  openCount: number;
  atRiskValue: number;
};

export type WeeklyRecovery = {
  weekStart: string;
  recoveredValue: number;
};

export type PriorityItem = {
  id: string;
  leakType: LeakType;
  patientName: string;
  reason: string;
  estimatedValue: number;
  priorityScore: number;
  dueAt: string | null;
};

export type DashboardSummary = {
  currency: string;
  recoveredValue: number;
  recoveredPreviousValue: number;
  recoveredBookings: number;
  atRiskValue: number;
  recoveryRate: number;
  leaks: Record<LeakType, LeakSummary>;
  weekly: WeeklyRecovery[];
  topItems: PriorityItem[];
};
