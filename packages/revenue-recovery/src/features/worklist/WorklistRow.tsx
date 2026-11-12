import { useId, useState, type FormEvent } from "react";
import { AlarmClock, Ban, CircleCheck, Play, RotateCcw, ThumbsDown } from "lucide-react";
import { WhatsAppLink } from "../../components/WhatsAppLink";
import { Button, Pill, cx } from "../../components/ui";
import { LEAK_META, TONE_CLASSES, type Tone } from "../../domain/leaks";
import type { RecoveryItemPatch, RecoveryItemStatus, WorklistItem } from "../../domain/types";
import { formatDate, formatDue, formatMoney } from "../../lib/format";

const HOUR_MS = 3_600_000;

const SNOOZE_OPTIONS = [
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
] as const;

const STATUS_PILL = {
  open: { label: "Open", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  recovered: { label: "Recovered", tone: "recovered" },
  lost: { label: "Lost", tone: "missed" },
  dismissed: { label: "Dismissed", tone: "neutral" },
} as const satisfies Record<RecoveryItemStatus, { label: string; tone: Tone }>;

const priorityPill = (score: number): { label: string; tone: Tone } => {
  if (score >= 80) return { label: "High", tone: "missed" };
  if (score >= 60) return { label: "Medium", tone: "risk" };
  return { label: "Low", tone: "neutral" };
};

type Panel = "none" | "snooze" | "lost";

type WorklistRowProps = {
  item: WorklistItem;
  currency: string;
  onUpdate: (patch: RecoveryItemPatch) => void;
};

export const WorklistRow = ({ item, currency, onUpdate }: WorklistRowProps) => {
  const [panel, setPanel] = useState<Panel>("none");
  const meta = LEAK_META[item.leakType];
  const tone = TONE_CLASSES[meta.tone];
  const priority = priorityPill(item.priorityScore);
  const status = STATUS_PILL[item.status];
  const Icon = meta.icon;

  const update = (patch: RecoveryItemPatch) => {
    setPanel("none");
    onUpdate(patch);
  };

  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <span className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold">{item.patientName}</p>
          {item.status === "open" || item.status === "in_progress" ? (
            <Pill tone={priority.tone}>{priority.label}</Pill>
          ) : null}
          {item.status !== "open" && <Pill tone={status.tone}>{status.label}</Pill>}
          <p className="rr-tabular ml-auto text-sm font-semibold">{formatMoney(item.estimatedValue, currency)}</p>
        </div>
        <p className="mt-0.5 text-[13px] text-rr-ink-soft">{item.reason}</p>
        <p className={cx("mt-0.5 text-xs", tone.ink)}>
          {meta.label} · <RowTiming item={item} />
        </p>
        {item.resolutionNote && <p className="mt-1 text-xs text-rr-ink-faint">Note: {item.resolutionNote}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RowActions item={item} panel={panel} setPanel={setPanel} update={update} />
        </div>

        {panel === "snooze" && (
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Snooze for">
            <span className="text-xs text-rr-ink-faint">Snooze for</span>
            {SNOOZE_OPTIONS.map((option) => (
              <Button
                key={option.label}
                variant="outline"
                onClick={() =>
                  update({ snoozedUntil: new Date(Date.now() + option.hours * HOUR_MS).toISOString() })
                }
              >
                {option.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setPanel("none")}>
              Cancel
            </Button>
          </div>
        )}

        {panel === "lost" && (
          <LostForm onCancel={() => setPanel("none")} onConfirm={(note) => update({ status: "lost", resolutionNote: note })} />
        )}
      </div>
    </li>
  );
};

const RowTiming = ({ item }: { item: WorklistItem }) => {
  if (item.resolvedAt && item.status !== "open" && item.status !== "in_progress") {
    return <>resolved {formatDate(item.resolvedAt)}</>;
  }
  if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > Date.now()) {
    return <>snoozed until {formatDate(item.snoozedUntil)}</>;
  }
  return <>{formatDue(item.dueAt)}</>;
};

type RowActionsProps = {
  item: WorklistItem;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  update: (patch: RecoveryItemPatch) => void;
};

const RowActions = ({ item, panel, setPanel, update }: RowActionsProps) => {
  const isResolved = item.status === "recovered" || item.status === "lost" || item.status === "dismissed";
  const isSnoozed = item.snoozedUntil !== null && new Date(item.snoozedUntil).getTime() > Date.now();

  if (isResolved) {
    return (
      <Button variant="outline" onClick={() => update({ status: "open", resolutionNote: null })}>
        <RotateCcw size={15} />
        Reopen
      </Button>
    );
  }

  return (
    <>
      <WhatsAppLink phone={item.contactPhone} patientName={item.patientName} />
      {item.status === "open" && (
        <Button variant="outline" onClick={() => update({ status: "in_progress" })}>
          <Play size={15} />
          Start
        </Button>
      )}
      {isSnoozed ? (
        <Button variant="outline" onClick={() => update({ snoozedUntil: null })}>
          <AlarmClock size={15} />
          Unsnooze
        </Button>
      ) : (
        <Button
          variant="outline"
          aria-expanded={panel === "snooze"}
          onClick={() => setPanel(panel === "snooze" ? "none" : "snooze")}
        >
          <AlarmClock size={15} />
          Snooze
        </Button>
      )}
      <Button variant="ghost" onClick={() => update({ status: "recovered" })}>
        <CircleCheck size={15} />
        Recovered
      </Button>
      <Button
        variant="ghost"
        aria-expanded={panel === "lost"}
        onClick={() => setPanel(panel === "lost" ? "none" : "lost")}
      >
        <ThumbsDown size={15} />
        Lost
      </Button>
      <Button variant="ghost" onClick={() => update({ status: "dismissed" })}>
        <Ban size={15} />
        Dismiss
      </Button>
    </>
  );
};

const LostForm = ({ onConfirm, onCancel }: { onConfirm: (note: string | null) => void; onCancel: () => void }) => {
  const [note, setNote] = useState("");
  const inputId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(note.trim() || null);
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={inputId}>
        Why was it lost? (optional)
      </label>
      <input
        id={inputId}
        autoFocus
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={200}
        placeholder="Why was it lost? (optional)"
        className="h-9 min-w-0 flex-1 basis-56 rounded-lg border border-rr-line-strong bg-rr-surface px-3 text-[13px] outline-none focus:border-rr-primary"
      />
      <Button type="submit">Mark lost</Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
};
