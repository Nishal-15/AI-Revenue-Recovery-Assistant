import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ListTodo, MessageCircleQuestion, PartyPopper, Search } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { Gauge } from "../../components/Gauge";
import { ErrorBanner, ListSkeleton, cx } from "../../components/ui";
import { useRecoveryContext } from "../../data/context";
import { useDashboardSummary } from "../../data/useDashboardSummary";
import { useApprovals, useTemplates } from "../../data/useOutreach";
import { useRecoveryItemActions } from "../../data/useRecoveryItemActions";
import { useWorklist } from "../../data/useWorklist";
import { LEAK_META, STATUS_WORDS, TONE_CLASSES, type Tone } from "../../domain/leaks";
import type { MessageTemplate } from "../../domain/outreach";
import { LEAK_TYPES, type RecoveryItemPatch, type WorklistItem } from "../../domain/types";
import { formatDate, formatMoney } from "../../lib/format";
import { isInView, sliceWorklist, type LeakFilter, type WorklistView } from "../worklist/worklistFilters";
import { PatientActions } from "./PatientActions";

const DAY_MS = 86_400_000;

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
  const summary = useDashboardSummary();
  const [view, setView] = useState<WorklistView>("active");
  const [leak, setLeak] = useState<LeakFilter>("all");
  const [search, setSearch] = useState("");

  const all = useMemo(() => worklist.data ?? [], [worklist.data]);
  const slice = useMemo(() => sliceWorklist(all, { view, leak, search, now: Date.now() }), [all, view, leak, search]);

  if (worklist.isPending) return <ListSkeleton label="Loading today's list" />;
  if (worklist.isError) return <ErrorBanner message={worklist.error.message} />;

  const now = Date.now();
  const active = all.filter((item) => isInView(item, "active", now));
  const totalValue = active.reduce((sum, item) => sum + item.estimatedValue, 0);
  const update = (id: string) => (patch: RecoveryItemPatch) => actions.mutate({ id, patch });
  const showNextUp = view === "active" && leak === "all" && !search.trim();
  const [nextUp, ...rest] = showNextUp ? slice.items : [undefined, ...slice.items];
  const templateList = templates.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-labelledby="rr-patients" className="flex min-w-0 flex-col gap-5">
        <p className="max-w-2xl text-xl font-light text-pretty text-rr-on-canvas-soft sm:text-2xl">
          {greeting(new Date())}{" "}
          {active.length > 0 ? (
            <>
              <span className="text-rr-on-canvas">
                {active.length === 1 ? "1 patient needs you today" : `${active.length} patients need you today`}
              </span>
              , about {formatMoney(totalValue, currency)} in treatment.
            </>
          ) : (
            <span className="text-rr-on-canvas">Everyone is looked after.</span>
          )}
        </p>

        {actions.isError && <ErrorBanner message={actions.error.message} onDismiss={() => actions.reset()} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rr-patients" className="text-2xl font-normal text-rr-on-canvas">
            Patients to contact
          </h2>
          <div role="group" aria-label="Show" className="flex gap-1 rounded-full border border-rr-canvas-line bg-rr-glass p-1">
            {(["active", "snoozed", "resolved"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cx(
                  "min-h-9 rounded-full px-4 text-sm transition-colors",
                  view === option ? "bg-rr-surface font-semibold text-rr-ink" : "text-rr-on-canvas-soft hover:text-rr-on-canvas",
                )}
              >
                {VIEW_NAMES[option]} {slice.viewCounts[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex h-11 items-center gap-2 rounded-full border border-rr-canvas-line bg-rr-glass px-4 text-rr-on-canvas focus-within:border-rr-recovered lg:w-64">
            <Search size={17} className="shrink-0 text-rr-on-canvas-soft" aria-hidden />
            <span className="sr-only">Find a patient</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a patient"
              className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-rr-on-canvas-soft"
            />
          </label>
          <div role="group" aria-label="Show only" className="flex flex-wrap gap-2">
            <Chip active={leak === "all"} onClick={() => setLeak("all")}>
              Everyone
            </Chip>
            {LEAK_TYPES.map((type) => (
              <Chip key={type} active={leak === type} onClick={() => setLeak(type)} dot={TONE_CLASSES[LEAK_META[type].tone].bar}>
                {LEAK_META[type].label} {slice.leakCounts[type]}
              </Chip>
            ))}
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {nextUp && (
            <li>
              <NextUp item={nextUp} currency={currency} templates={templateList} onUpdate={update(nextUp.id)} />
            </li>
          )}
          {rest.map((item) =>
            item ? (
              <PatientCard key={item.id} item={item} currency={currency} templates={templateList} onUpdate={update(item.id)} />
            ) : null,
          )}
        </ul>
        {!nextUp && rest.length === 0 && <EmptyList view={view} />}
      </section>

      <aside aria-label="At a glance" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Tile tone="light" label="To do today" value={active.length} icon={<ListTodo size={20} />} />
          <Tile
            tone="dark"
            label="Waiting for a reply"
            value={active.filter((item) => item.leakType === "missed_enquiry").length}
            icon={<MessageCircleQuestion size={20} />}
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-rr-canvas-line rounded-rr-card border border-rr-canvas-line bg-rr-glass py-5">
          <SplitStat value={summary.data?.recoveredBookings ?? 0} label="Booked this month" />
          <SplitStat value={active.filter((item) => item.status === "in_progress").length} label="Working on it" />
        </div>
        <WonBackCard
          rate={summary.data?.recoveryRate ?? 0}
          value={summary.data ? formatMoney(summary.data.recoveredValue, currency) : "…"}
          booked={all.filter((item) => item.status === "recovered").length}
          notComing={all.filter((item) => item.status === "lost").length}
          later={slice.viewCounts.snoozed}
        />
        <NeedsAttention
          reminders={approvals.data?.length ?? 0}
          urgent={active.filter((item) => item.priorityScore >= 80).length}
          dueSoon={active.filter((item) => item.leakType === "unconfirmed_appointment" && item.dueAt !== null && new Date(item.dueAt).getTime() - now < DAY_MS).length}
          onOpenMessages={onOpenMessages}
        />
      </aside>
    </div>
  );
};

const Tile = ({ tone, label, value, icon }: { tone: "light" | "dark"; label: string; value: number; icon: ReactNode }) => (
  <div
    className={cx(
      "flex aspect-[1.1] flex-col justify-between rounded-rr-card p-5",
      tone === "light" ? "bg-rr-surface text-rr-ink" : "border border-rr-canvas-line bg-rr-canvas-raised/70 text-rr-on-canvas",
    )}
  >
    <p className={tone === "light" ? "text-rr-ink-soft" : "text-rr-on-canvas-soft"}>{label}</p>
    <div className="flex items-end justify-between">
      <p className="rr-tabular text-6xl font-light tracking-tight">{String(value).padStart(2, "0")}</p>
      <span className={tone === "light" ? "text-rr-ink-soft" : "text-rr-on-canvas-soft"} aria-hidden>
        {icon}
      </span>
    </div>
  </div>
);

const SplitStat = ({ value, label }: { value: number; label: string }) => (
  <div className="px-5">
    <p className="rr-tabular text-4xl font-light text-rr-on-canvas">{String(value).padStart(2, "0")}</p>
    <p className="mt-1 text-rr-on-canvas-soft">{label}</p>
  </div>
);

const WonBackCard = ({
  rate,
  value,
  booked,
  notComing,
  later,
}: {
  rate: number;
  value: string;
  booked: number;
  notComing: number;
  later: number;
}) => (
  <section aria-labelledby="rr-won-back" className="rounded-rr-card bg-rr-surface p-5 text-rr-ink">
    <div className="flex items-baseline justify-between gap-2">
      <h2 id="rr-won-back" className="text-xl font-normal">
        Won back this month
      </h2>
      <p className="rr-tabular font-semibold text-rr-primary-strong">{value}</p>
    </div>
    <div className="relative mt-2 flex justify-center text-rr-ink">
      <Gauge share={rate} />
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="rr-tabular text-5xl font-light">
          {Math.round(rate * 100)}
          <span className="text-2xl">%</span>
        </p>
        <p className="text-sm text-rr-ink-soft">of patients said yes</p>
      </div>
    </div>
    <dl className="mt-4 grid grid-cols-3 text-center">
      <MiniStat value={booked} label="Booked" />
      <MiniStat value={notComing} label="Not coming" />
      <MiniStat value={later} label="Later" />
    </dl>
  </section>
);

const MiniStat = ({ value, label }: { value: number; label: string }) => (
  <div>
    <dd className="rr-tabular text-2xl font-light">{String(value).padStart(2, "0")}</dd>
    <dt className="text-sm text-rr-ink-soft">{label}</dt>
  </div>
);

const NeedsAttention = ({
  reminders,
  urgent,
  dueSoon,
  onOpenMessages,
}: {
  reminders: number;
  urgent: number;
  dueSoon: number;
  onOpenMessages: () => void;
}) => {
  const rows = [
    reminders > 0 && { title: "WhatsApp reminders", detail: "Ready and waiting for your OK", badge: reminders },
    urgent > 0 && { title: "Urgent patients", detail: "Contact them first today", badge: urgent },
    dueSoon > 0 && { title: "Not confirmed, coming soon", detail: "Appointment in the next 24 hours", badge: dueSoon },
  ].filter((row): row is { title: string; detail: string; badge: number } => Boolean(row));
  const total = rows.length;

  return (
    <section aria-labelledby="rr-attention" className="rounded-rr-card border border-rr-canvas-line bg-rr-canvas-raised/70 p-5 text-rr-on-canvas">
      <div className="flex items-center justify-between">
        <h2 id="rr-attention" className="text-xl font-normal">
          Needs attention
        </h2>
        {total > 0 && (
          <span className="grid h-7 min-w-9 place-items-center rounded-full bg-rr-missed-soft px-2 text-sm font-bold text-rr-missed-ink">
            {String(total).padStart(2, "0")}
          </span>
        )}
      </div>
      {total === 0 ? (
        <p className="mt-3 text-rr-on-canvas-soft">Nothing urgent right now.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {rows.map((row) => (
            <li key={row.title} className="flex items-center justify-between gap-3 border-b border-rr-canvas-line py-3 last:border-0">
              <div>
                <p className="font-semibold">{row.title}</p>
                <p className="text-sm text-rr-on-canvas-soft">{row.detail}</p>
              </div>
              <span className="rounded-full bg-rr-glass-strong px-3 py-1 text-sm">{row.badge}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onOpenMessages}
        className="mt-3 flex h-11 w-full items-center justify-between rounded-full border border-rr-canvas-line px-5 transition-colors hover:bg-rr-glass-strong"
      >
        Open messages
        <ArrowUpRight size={18} aria-hidden />
      </button>
    </section>
  );
};

const UrgencyBar = ({ score }: { score: number }) => {
  const level = urgency(score);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-black/10" aria-hidden>
      <div
        className={cx("h-full rounded-full", level.tone === "missed" ? "bg-rr-missed" : level.tone === "risk" ? "bg-rr-risk" : "bg-rr-recovered")}
        style={{ width: `${Math.max(score, 8)}%` }}
      />
    </div>
  );
};

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
  const level = urgency(item.priorityScore);
  return (
    <section aria-labelledby="rr-next-up" className="rounded-rr-card bg-rr-surface p-5 text-rr-ink shadow-rr-lift sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar name={item.patientName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rr-primary-strong">Next up</p>
          <h3 id="rr-next-up" className="text-2xl font-semibold tracking-tight">
            {item.patientName}
          </h3>
          <p className="text-rr-ink-soft">{meta.label}</p>
        </div>
        <Tag tone={level.tone}>{level.label}</Tag>
      </div>
      <p className="mt-4 text-lg">{item.reason}</p>
      <div className="mt-3 flex items-center justify-between text-sm text-rr-ink-soft">
        <span>How urgent</span>
        <span className="rr-tabular">about {formatMoney(item.estimatedValue, currency)}</span>
      </div>
      <div className="mt-1.5">
        <UrgencyBar score={item.priorityScore} />
      </div>
      <div className="mt-5">
        <PatientActions item={item} templates={templates} onUpdate={onUpdate} size="large" />
      </div>
    </section>
  );
};

const PatientCard = ({
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
  const level = urgency(item.priorityScore);
  const finished = item.status === "recovered" || item.status === "lost" || item.status === "dismissed";
  const status = STATUS_WORDS[item.status];
  const later = item.snoozedUntil !== null && new Date(item.snoozedUntil).getTime() > Date.now();

  const footer = finished
    ? `${status.label}${item.resolvedAt ? ` on ${formatDate(item.resolvedAt)}` : ""}${item.resolutionNote ? `: ${item.resolutionNote}` : ""}`
    : later && item.snoozedUntil
      ? `Back on your list ${formatDate(item.snoozedUntil)}`
      : `about ${formatMoney(item.estimatedValue, currency)}`;

  // The card you open turns light, like the patient you are working on right now.
  return (
    <li
      className={cx(
        "rounded-rr-card transition-colors",
        open ? "bg-rr-surface text-rr-ink shadow-rr-lift" : "border border-rr-canvas-line bg-rr-canvas-raised/70 text-rr-on-canvas hover:bg-rr-canvas-raised",
      )}
    >
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-4 rounded-rr-card p-5 text-left">
        <Avatar name={item.patientName} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-lg font-semibold">{item.patientName}</span>
            {!finished && !later && <Tag tone={level.tone}>{level.label}</Tag>}
          </span>
          <span className={cx("block text-sm", open ? "text-rr-ink-soft" : "text-rr-on-canvas-soft")}>{meta.label}</span>
          <span className="mt-2 block">{item.reason}</span>
          <span className={cx("mt-1 block text-sm", open ? "text-rr-ink-soft" : "text-rr-on-canvas-soft")}>{footer}</span>
        </span>
        <ChevronDown size={20} aria-hidden className={cx("mt-3 shrink-0 opacity-70 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-rr-line px-5 py-5 sm:pl-20">
          <PatientActions item={item} templates={templates} onUpdate={onUpdate} />
        </div>
      )}
    </li>
  );
};

const Tag = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={cx("shrink-0 rounded-full px-3 py-0.5 text-sm font-semibold", TONE_CLASSES[tone].soft, TONE_CLASSES[tone].ink)}>
    {children}
  </span>
);

const Chip = ({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: ReactNode }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cx(
      "inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors",
      active ? "bg-rr-surface font-semibold text-rr-ink" : "border border-rr-canvas-line bg-rr-glass text-rr-on-canvas hover:bg-rr-glass-strong",
    )}
  >
    {dot && <span className={cx("size-2 rounded-full", dot)} aria-hidden />}
    {children}
  </button>
);

const EmptyList = ({ view }: { view: WorklistView }) => (
  <div className="flex flex-col items-center gap-2 rounded-rr-card border border-rr-canvas-line bg-rr-glass px-6 py-12 text-center text-rr-on-canvas">
    <PartyPopper size={26} className="text-rr-recovered" aria-hidden />
    <p className="text-lg">
      {view === "active" ? "Nobody else is waiting." : view === "snoozed" ? "Nothing set for later." : "Nothing finished in the last 30 days."}
    </p>
  </div>
);

