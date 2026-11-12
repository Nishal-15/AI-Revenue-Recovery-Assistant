import { useMemo, useState, type ReactNode } from "react";
import { PartyPopper, Search } from "lucide-react";
import { Card, EmptyState, ErrorBanner, ListSkeleton, SegmentedControl, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useRecoveryItemActions } from "../../data/useRecoveryItemActions";
import { useWorklist } from "../../data/useWorklist";
import { LEAK_META, TONE_CLASSES } from "../../domain/leaks";
import { LEAK_TYPES } from "../../domain/types";
import { formatMoney, pluralize } from "../../lib/format";
import { WorklistRow } from "./WorklistRow";
import { sliceWorklist, type LeakFilter, type WorklistView } from "./worklistFilters";

const VIEW_TITLES = {
  active: { empty: "Nothing slipping right now", total: "at risk" },
  snoozed: { empty: "No snoozed items", total: "snoozed" },
  resolved: { empty: "Nothing resolved in the last 30 days", total: "resolved" },
} as const satisfies Record<WorklistView, { empty: string; total: string }>;

export const WorklistPage = () => {
  const { currency } = useRecoveryContext();
  const { data, isPending, isError, error } = useWorklist();
  const actions = useRecoveryItemActions();
  const [view, setView] = useState<WorklistView>("active");
  const [leak, setLeak] = useState<LeakFilter>("all");
  const [search, setSearch] = useState("");

  const slice = useMemo(
    () => sliceWorklist(data ?? [], { view, leak, search, now: Date.now() }),
    [data, view, leak, search],
  );

  if (isPending) return <ListSkeleton label="Loading worklist" />;
  if (isError) return <ErrorBanner message={error.message} />;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-rr-ink-soft">{pluralize(slice.items.length, "item")}</p>
            <p className="rr-tabular font-rr-display text-2xl font-bold">
              {formatMoney(slice.totalValue, currency)}{" "}
              <span className="text-sm font-medium text-rr-ink-faint">{VIEW_TITLES[view].total}</span>
            </p>
          </div>
          <SegmentedControl
            label="Worklist view"
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: `To do (${slice.viewCounts.active})` },
              { value: "snoozed", label: `Snoozed (${slice.viewCounts.snoozed})` },
              { value: "resolved", label: `Resolved (${slice.viewCounts.resolved})` },
            ]}
          />
        </div>

        <label className="flex h-10 items-center gap-2 rounded-lg border border-rr-line-strong bg-rr-surface px-3 focus-within:border-rr-primary">
          <Search size={16} className="shrink-0 text-rr-ink-faint" />
          <span className="sr-only">Search the worklist</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone or reason"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        <div role="group" aria-label="Filter by leak type" className="flex flex-wrap gap-2">
          <FilterChip active={leak === "all"} onClick={() => setLeak("all")}>
            All · {slice.leakCounts.all}
          </FilterChip>
          {LEAK_TYPES.map((type) => (
            <FilterChip key={type} active={leak === type} onClick={() => setLeak(type)} dotClass={TONE_CLASSES[LEAK_META[type].tone].bar}>
              {LEAK_META[type].label} · {slice.leakCounts[type]}
            </FilterChip>
          ))}
        </div>
      </Card>

      {actions.isError && <ErrorBanner message={actions.error.message} onDismiss={() => actions.reset()} />}

      <Card>
        {slice.items.length === 0 ? (
          <EmptyState icon={<PartyPopper size={22} />} title={VIEW_TITLES[view].empty} />
        ) : (
          <ul className="divide-y divide-rr-line">
            {slice.items.map((item) => (
              <WorklistRow
                key={item.id}
                item={item}
                currency={currency}
                onUpdate={(patch) => actions.mutate({ id: item.id, patch })}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

const FilterChip = ({
  active,
  onClick,
  dotClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dotClass?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cx(
      "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors",
      active
        ? "border-rr-primary bg-rr-primary-soft text-rr-primary-strong"
        : "border-rr-line-strong bg-rr-surface text-rr-ink-soft hover:border-rr-primary hover:text-rr-ink",
    )}
  >
    {dotClass && <span className={cx("size-2 rounded-full", dotClass)} aria-hidden />}
    {children}
  </button>
);
