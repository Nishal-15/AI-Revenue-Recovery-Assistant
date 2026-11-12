import { isResolvedStatus } from "../../data/recoveryItemPatch";
import { LEAK_TYPES, type LeakType, type WorklistItem } from "../../domain/types";

export type WorklistView = "active" | "snoozed" | "resolved";
export type LeakFilter = LeakType | "all";

const isSnoozed = (item: WorklistItem, now: number): boolean =>
  item.snoozedUntil !== null && new Date(item.snoozedUntil).getTime() > now;

export const isInView = (item: WorklistItem, view: WorklistView, now: number): boolean => {
  if (view === "resolved") return isResolvedStatus(item.status);
  if (isResolvedStatus(item.status)) return false;
  return view === "snoozed" ? isSnoozed(item, now) : !isSnoozed(item, now);
};

const matchesSearch = (item: WorklistItem, search: string): boolean => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  return (
    item.patientName.toLowerCase().includes(needle) ||
    item.reason.toLowerCase().includes(needle) ||
    (digits.length >= 3 && (item.contactPhone ?? "").replace(/\D/g, "").includes(digits))
  );
};

const byPriority = (a: WorklistItem, b: WorklistItem): number =>
  b.priorityScore - a.priorityScore || b.estimatedValue - a.estimatedValue;

const byMostRecentlyResolved = (a: WorklistItem, b: WorklistItem): number =>
  (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "");

export type WorklistSlice = {
  items: WorklistItem[];
  leakCounts: Record<LeakFilter, number>;
  viewCounts: Record<WorklistView, number>;
  totalValue: number;
};

/** Everything the worklist renders, derived in one pass so counts and rows always agree. */
export const sliceWorklist = (
  all: WorklistItem[],
  { view, leak, search, now }: { view: WorklistView; leak: LeakFilter; search: string; now: number },
): WorklistSlice => {
  const viewCounts: Record<WorklistView, number> = {
    active: all.filter((item) => isInView(item, "active", now)).length,
    snoozed: all.filter((item) => isInView(item, "snoozed", now)).length,
    resolved: all.filter((item) => isInView(item, "resolved", now)).length,
  };

  const inViewAndSearch = all.filter((item) => isInView(item, view, now) && matchesSearch(item, search));

  const leakCounts = Object.fromEntries([
    ["all", inViewAndSearch.length],
    ...LEAK_TYPES.map((type) => [type, inViewAndSearch.filter((item) => item.leakType === type).length]),
  ]) as Record<LeakFilter, number>;

  const items = inViewAndSearch
    .filter((item) => leak === "all" || item.leakType === leak)
    .sort(view === "resolved" ? byMostRecentlyResolved : byPriority);

  return { items, leakCounts, viewCounts, totalValue: items.reduce((sum, item) => sum + item.estimatedValue, 0) };
};
