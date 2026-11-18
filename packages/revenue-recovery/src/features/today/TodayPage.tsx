import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, PartyPopper, Search, ShieldCheck } from "lucide-react";
import { Button, ErrorBanner, ListSkeleton, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useApprovals, useTemplates } from "../../data/useOutreach";
import { useRecoveryItemActions } from "../../data/useRecoveryItemActions";
import { useWorklist } from "../../data/useWorklist";
import { LEAK_META, STATUS_WORDS, TONE_CLASSES, type Tone } from "../../domain/leaks";
import type { MessageTemplate } from "../../domain/outreach";
import { LEAK_TYPES, type RecoveryItemPatch, type WorklistItem } from "../../domain/types";
import { formatDate, formatMoney } from "../../lib/format";
import { sliceWorklist, type LeakFilter, type WorklistView } from "../worklist/worklistFilters";
import { PatientActions } from "./PatientActions";

const urgency = (score: number): { label: string; tone: Tone } => {
  if (score >= 80) return { label: "Urgent", tone: "missed" };
  if (score >= 60) return { label: "Soon", tone: "risk" };
  return { label: "When you can", tone: "neutral" };
};

const greeting = (now: Date): string => {
  const hour = now.getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
};

const VIEW_NAMES = { active: "To do", snoozed: "Later", resolved: "Finished" } as const satisfies Record<WorklistView, string>;

export const TodayPage = ({ onOpenMessages }: { onOpenMessages: () => void }) => {
  const { currency } = useRecoveryContext();
  const worklist = useWorklist();
  const actions = useRecoveryItemActions();
  const templates = useTemplates();
  const approvals = useApprovals();
  const [view, setView] = useState<WorklistView>("active");
  const [leak, setLeak] = useState<LeakFilter>("all");
  const [search, setSearch] = useState("");

  const all = useMemo(() => worklist.data ?? [], [worklist.data]);
  const slice = useMemo(() => sliceWorklist(all, { view, leak, search, now: Date.now() }), [all, view, leak, search]);
  const waiting = useMemo(() => sliceWorklist(all, { view: "active", leak: "all", search: "", now: Date.now() }), [all]);

  if (worklist.isPending) return <ListSkeleton label="Loading today's list" />;
  if (worklist.isError) return <ErrorBanner message={worklist.error.message} />;

  const update = (id: string) => (patch: RecoveryItemPatch) => actions.mutate({ id, patch });
  const showNextUp = view === "active" && leak === "all" && !search.trim();
  const [nextUp, ...rest] = showNextUp ? slice.items : [undefined, ...slice.items];
  const reminders = approvals.data?.length ?? 0;
  const templateList = templates.data ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <Headline count={waiting.items.length} value={waiting.totalValue} currency={currency} />

      {reminders > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-rr-risk-soft px-5 py-4">
          <ShieldCheck size={20} className="shrink-0 text-rr-risk-ink" aria-hidden />
          <p className="min-w-0 flex-1 basis-60 text-rr-ink">
            {reminders === 1 ? "1 WhatsApp reminder is" : `${reminders} WhatsApp reminders are`} ready and waiting for
            your OK.
          </p>
          <Button onClick={onOpenMessages}>Check and send</Button>
        </div>
      )}

      {actions.isError && <ErrorBanner message={actions.error.message} onDismiss={() => actions.reset()} />}

      {nextUp && (
        <NextUp item={nextUp} currency={currency} templates={templateList} onUpdate={update(nextUp.id)} />
      )}

      <section aria-labelledby="rr-everyone" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="rr-everyone" className="font-rr-display text-2xl font-bold">
            {showNextUp ? "Also waiting" : VIEW_NAMES[view]}
          </h2>
          <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-rr-surface p-1">
            {(["active", "snoozed", "resolved"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cx(
                  "min-h-9 rounded-full px-4 text-sm transition-colors",
                  view === option ? "bg-rr-ink font-bold text-white" : "text-rr-ink-soft hover:text-rr-ink",
                )}
              >
                {VIEW_NAMES[option]} {slice.viewCounts[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-rr-surface px-3.5 shadow-rr-card focus-within:outline-2 focus-within:outline-rr-primary sm:w-72">
            <Search size={17} className="shrink-0 text-rr-ink-faint" aria-hidden />
            <span className="sr-only">Find a patient</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a patient"
              className="h-full min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <div role="group" aria-label="Show only" className="flex flex-wrap gap-2">
            <Chip active={leak === "all"} onClick={() => setLeak("all")}>
              Everyone
            </Chip>
            {LEAK_TYPES.map((type) => (
              <Chip
                key={type}
                active={leak === type}
                onClick={() => setLeak(type)}
                dot={TONE_CLASSES[LEAK_META[type].tone].bar}
              >
                {LEAK_META[type].label} {slice.leakCounts[type]}
              </Chip>
            ))}
          </div>
        </div>

        {rest.length === 0 && !nextUp ? (
          <EmptyList view={view} />
        ) : (
          <ul className="flex flex-col gap-2">
            {rest.map((item) =>
              item ? (
                <PatientRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  templates={templateList}
                  onUpdate={update(item.id)}
                />
              ) : null,
            )}
          </ul>
        )}
      </section>
    </div>
  );
};

const Headline = ({ count, value, currency }: { count: number; value: number; currency: string }) => (
  <div className="pt-2">
    <p className="font-rr-display text-xl font-semibold text-rr-ink-soft">{greeting(new Date())}</p>
    {count > 0 ? (
      <>
        <h1 className="font-rr-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
          {count === 1 ? "1 patient needs you today." : `${count} patients need you today.`}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-pretty text-rr-ink-soft">
          Together that is about <strong className="text-rr-ink">{formatMoney(value, currency)}</strong> in treatment. Start
          with the first one below.
        </p>
      </>
    ) : (
      <>
        <h1 className="font-rr-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
          Everyone is looked after.
        </h1>
        <p className="mt-3 max-w-xl text-lg text-pretty text-rr-ink-soft">New patients to follow up will appear here by themselves.</p>
      </>
    )}
  </div>
);

const NextUp = ({
  item,
  currency,
  templates,
  onUpdate,
}: {
  item: WorklistItem;
  currency: string;
  templates: MessageTemplate[];
  onUpdate: (patch: RecoveryItemPatch) => void;
}) => {
  const meta = LEAK_META[item.leakType];
  const tone = TONE_CLASSES[meta.tone];
  const level = urgency(item.priorityScore);
  return (
    <section
      aria-labelledby="rr-next-up"
      className="relative overflow-hidden rounded-[1.75rem] bg-rr-surface p-6 shadow-rr-lift sm:p-8"
    >
      <span className={cx("absolute inset-y-0 left-0 w-2", tone.bar)} aria-hidden />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-rr-ink-soft">Next up</span>
        <Tag tone={meta.tone}>{meta.label}</Tag>
        <Tag tone={level.tone}>{level.label}</Tag>
      </div>
      <h2 id="rr-next-up" className="mt-3 font-rr-display text-3xl font-bold tracking-tight sm:text-4xl">
        {item.patientName}
      </h2>
      <p className="mt-1.5 max-w-2xl text-lg">{item.reason}</p>
      <p className="mt-1 text-rr-ink-soft">Worth about {formatMoney(item.estimatedValue, currency)}</p>
      <div className="mt-6">
        <PatientActions item={item} templates={templates} onUpdate={onUpdate} size="large" />
      </div>
    </section>
  );
};

const PatientRow = ({
  item,
  currency,
  templates,
  onUpdate,
}: {
  item: WorklistItem;
  currency: string;
  templates: MessageTemplate[];
  onUpdate: (patch: RecoveryItemPatch) => void;
}) => {
  const [open, setOpen] = useState(false);
  const meta = LEAK_META[item.leakType];
  const tone = TONE_CLASSES[meta.tone];
  const level = urgency(item.priorityScore);
  const finished = item.status === "recovered" || item.status === "lost" || item.status === "dismissed";
  const status = STATUS_WORDS[item.status];
  const later = item.snoozedUntil && new Date(item.snoozedUntil).getTime() > Date.now();

  return (
    <li className={cx("rounded-2xl bg-rr-surface transition-shadow", open ? "shadow-rr-lift" : "shadow-rr-card")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 rounded-2xl px-4 py-4 text-left sm:px-5"
      >
        <span className={cx("mt-1.5 size-3 shrink-0 rounded-full", tone.bar)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[17px] font-bold">{item.patientName}</span>
            <span className={cx("text-sm", tone.ink)}>{meta.label}</span>
          </span>
          <span className="mt-0.5 block text-rr-ink-soft">{item.reason}</span>
          <span className="mt-1 block text-sm text-rr-ink-faint">
            {finished
              ? `${status.label}${item.resolvedAt ? ` on ${formatDate(item.resolvedAt)}` : ""}${item.resolutionNote ? `: ${item.resolutionNote}` : ""}`
              : later && item.snoozedUntil
                ? `Back on your list ${formatDate(item.snoozedUntil)}`
                : `${level.label} · about ${formatMoney(item.estimatedValue, currency)}`}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden
          className={cx("mt-1 shrink-0 text-rr-ink-faint transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-rr-line px-4 py-4 sm:px-5 sm:pl-12">
          <PatientActions item={item} templates={templates} onUpdate={onUpdate} />
        </div>
      )}
    </li>
  );
};

const Tag = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={cx("rounded-full px-2.5 py-0.5 text-sm", TONE_CLASSES[tone].soft, TONE_CLASSES[tone].ink)}>
    {children}
  </span>
);

const Chip = ({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cx(
      "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
      active
        ? "border-rr-ink bg-rr-ink text-white"
        : "border-rr-line-strong bg-rr-surface text-rr-ink-soft hover:border-rr-ink-faint hover:text-rr-ink",
    )}
  >
    {dot && <span className={cx("size-2 rounded-full", dot)} aria-hidden />}
    {children}
  </button>
);

const EmptyList = ({ view }: { view: WorklistView }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl bg-rr-surface px-6 py-12 text-center">
    <PartyPopper size={26} className="text-rr-recovered" aria-hidden />
    <p className="text-lg font-bold">
      {view === "active" ? "Nobody else is waiting." : view === "snoozed" ? "Nothing set for later." : "Nothing finished in the last 30 days."}
    </p>
  </div>
);
