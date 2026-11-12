import { useMemo, useState } from "react";
import { UserRoundCheck } from "lucide-react";
import { WhatsAppLink } from "../../components/WhatsAppLink";
import { Card, EmptyState, ErrorBanner, ListSkeleton, Pill, SegmentedControl } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useRecalls } from "../../data/useRecalls";
import type { Tone } from "../../domain/leaks";
import type { FollowupKind, OverdueFollowup } from "../../domain/types";
import { calendarDaysBetween, formatDate, formatMoney, formatOverdue, parseDateKey, pluralize } from "../../lib/format";

type SortOrder = "value" | "overdue";

const KIND_LABELS = {
  treatment_step: { tab: "Treatment steps", empty: "Every planned treatment step is booked" },
  recall: { tab: "Recalls", empty: "No overdue recalls" },
} as const satisfies Record<FollowupKind, { tab: string; empty: string }>;

const daysOverdue = (followup: OverdueFollowup, now: Date): number =>
  calendarDaysBetween(parseDateKey(followup.dueOn), now);

const overdueTone = (days: number): Tone => (days >= 60 ? "missed" : days >= 21 ? "risk" : "info");

const sortFollowups = (followups: OverdueFollowup[], order: SortOrder): OverdueFollowup[] =>
  [...followups].sort((a, b) =>
    order === "value" ? b.estimatedValue - a.estimatedValue || a.dueOn.localeCompare(b.dueOn) : a.dueOn.localeCompare(b.dueOn),
  );

export const RecallsPage = () => {
  const { currency } = useRecoveryContext();
  const { data, isPending, isError, error } = useRecalls();
  const [kind, setKind] = useState<FollowupKind>("treatment_step");
  const [order, setOrder] = useState<SortOrder>("value");

  const byKind = useMemo(() => {
    const all = data ?? [];
    return {
      treatment_step: all.filter((followup) => followup.kind === "treatment_step"),
      recall: all.filter((followup) => followup.kind === "recall"),
    } satisfies Record<FollowupKind, OverdueFollowup[]>;
  }, [data]);

  const visible = useMemo(() => sortFollowups(byKind[kind], order), [byKind, kind, order]);
  const totalValue = visible.reduce((sum, followup) => sum + followup.estimatedValue, 0);

  if (isPending) return <ListSkeleton label="Loading overdue follow-ups" />;
  if (isError) return <ErrorBanner message={error.message} />;

  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-rr-ink-soft">{pluralize(visible.length, "patient")} not back yet</p>
            <p className="rr-tabular font-rr-display text-2xl font-bold">
              {formatMoney(totalValue, currency)}{" "}
              <span className="text-sm font-medium text-rr-ink-faint">to win back</span>
            </p>
          </div>
          <SegmentedControl
            label="Follow-up type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "treatment_step", label: `${KIND_LABELS.treatment_step.tab} (${byKind.treatment_step.length})` },
              { value: "recall", label: `${KIND_LABELS.recall.tab} (${byKind.recall.length})` },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-rr-ink-faint">Sort by</span>
          <SegmentedControl
            label="Sort follow-ups"
            value={order}
            onChange={setOrder}
            options={[
              { value: "value", label: "Highest value" },
              { value: "overdue", label: "Most overdue" },
            ]}
          />
        </div>
      </Card>

      <Card>
        {visible.length === 0 ? (
          <EmptyState icon={<UserRoundCheck size={22} />} title={KIND_LABELS[kind].empty} />
        ) : (
          <ul className="divide-y divide-rr-line">
            {visible.map((followup) => {
              const days = daysOverdue(followup, now);
              return (
                <li key={followup.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-semibold">{followup.patientName}</p>
                    <p className="truncate text-[13px] text-rr-ink-soft">{followup.procedure}</p>
                    <p className="mt-0.5 text-xs text-rr-ink-faint">
                      Last visit {followup.lastVisitAt ? formatDate(followup.lastVisitAt) : "unknown"}
                    </p>
                  </div>
                  <Pill tone={overdueTone(days)}>{formatOverdue(days)}</Pill>
                  <p className="rr-tabular w-24 text-right text-sm font-semibold">
                    {formatMoney(followup.estimatedValue, currency)}
                  </p>
                  <WhatsAppLink phone={followup.patientPhone} patientName={followup.patientName} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
