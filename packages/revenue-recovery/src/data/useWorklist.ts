import { useQuery } from "@tanstack/react-query";
import type { LeakType, RecoveryItemStatus, WorklistItem } from "../domain/types";
import { useRecoveryContext } from "./context";
import { demoStore } from "./demoStore";

/** Resolved items stay visible in the "Resolved" view for this long. */
export const RESOLVED_LOOKBACK_DAYS = 30;

type RawRecoveryItem = {
  id: string;
  leak_type: LeakType;
  patient_name: string | null;
  contact_phone: string | null;
  reason: string | null;
  estimated_value: number | string;
  priority_score: number | string;
  status: RecoveryItemStatus;
  due_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

const ITEM_COLUMNS =
  "id, leak_type, patient_name, contact_phone, reason, estimated_value, priority_score, status, due_at, snoozed_until, resolved_at, resolution_note";

const toWorklistItem = (raw: RawRecoveryItem): WorklistItem => ({
  id: raw.id,
  leakType: raw.leak_type,
  patientName: raw.patient_name ?? "Unknown patient",
  contactPhone: raw.contact_phone,
  reason: raw.reason ?? "",
  estimatedValue: Number(raw.estimated_value),
  priorityScore: Number(raw.priority_score),
  status: raw.status,
  dueAt: raw.due_at,
  snoozedUntil: raw.snoozed_until,
  resolvedAt: raw.resolved_at,
  resolutionNote: raw.resolution_note,
});

export const useWorklistQueryKey = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return ["recovery", "worklist", clinicId, supabase ? "live" : "demo"] as const;
};

/** Every open item plus anything resolved in the last 30 days; views filter client-side. */
export const useWorklist = () => {
  const { supabase, clinicId } = useRecoveryContext();
  const queryKey = useWorklistQueryKey();

  return useQuery({
    queryKey,
    queryFn: async (): Promise<WorklistItem[]> => {
      if (!supabase) return demoStore.listItems();
      const resolvedSince = new Date(Date.now() - RESOLVED_LOOKBACK_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .schema("recovery")
        .from("recovery_items")
        .select(ITEM_COLUMNS)
        .eq("clinic_id", clinicId)
        .or(`status.in.(open,in_progress),resolved_at.gte.${resolvedSince}`)
        .order("priority_score", { ascending: false })
        .limit(1000);
      if (error) throw new Error(`Could not load the worklist: ${error.message}`);
      return (data as RawRecoveryItem[]).map(toWorklistItem);
    },
  });
};
