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

export const OPEN_STATUSES = ["open", "in_progress"] as const satisfies readonly RecoveryItemStatus[];
export const RESOLVED_STATUSES = ["recovered", "lost", "dismissed"] as const satisfies readonly RecoveryItemStatus[];

export type ResolvedStatus = (typeof RESOLVED_STATUSES)[number];

export type WorklistItem = {
  id: string;
  leakType: LeakType;
  patientName: string;
  contactPhone: string | null;
  reason: string;
  estimatedValue: number;
  priorityScore: number;
  status: RecoveryItemStatus;
  dueAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

/** The only fields staff change on a recovery item; the database trigger handles resolved_at and the audit log. */
export type RecoveryItemPatch = {
  status?: RecoveryItemStatus;
  snoozedUntil?: string | null;
  resolutionNote?: string | null;
};

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";

export type UpcomingAppointment = {
  id: string;
  startsAt: string;
  status: Extract<AppointmentStatus, "scheduled" | "confirmed">;
  treatment: string;
  estimatedValue: number;
  patientName: string;
  patientPhone: string | null;
};

export type FollowupKind = "treatment_step" | "recall";

export type OverdueFollowup = {
  id: string;
  kind: FollowupKind;
  procedure: string;
  /** Calendar date, YYYY-MM-DD. */
  dueOn: string;
  estimatedValue: number;
  patientName: string;
  patientPhone: string | null;
  lastVisitAt: string | null;
};
