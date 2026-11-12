import { RESOLVED_STATUSES, type RecoveryItemPatch, type RecoveryItemStatus, type WorklistItem } from "../domain/types";

export const isResolvedStatus = (status: RecoveryItemStatus): boolean =>
  (RESOLVED_STATUSES as readonly RecoveryItemStatus[]).includes(status);

/** Applies a staff edit the way the database does, including the trigger's resolved_at bookkeeping. */
export const applyItemPatch = (item: WorklistItem, patch: RecoveryItemPatch, now: Date = new Date()): WorklistItem => {
  const next: WorklistItem = { ...item, ...patch };
  if (patch.status !== undefined && patch.status !== item.status) {
    next.resolvedAt = isResolvedStatus(patch.status) ? (item.resolvedAt ?? now.toISOString()) : null;
  }
  return next;
};

/** Column names for an update to recovery.recovery_items. Only fields present in the patch are sent. */
export const toItemUpdateRow = (patch: RecoveryItemPatch): Record<string, string | null> => {
  const row: Record<string, string | null> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.snoozedUntil !== undefined) row.snoozed_until = patch.snoozedUntil;
  if (patch.resolutionNote !== undefined) row.resolution_note = patch.resolutionNote;
  return row;
};
