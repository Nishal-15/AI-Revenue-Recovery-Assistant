import { useId, useState, type FormEvent } from "react";
import { AlarmClock, Ban, Check, CircleCheck, MessageCircle, Play, RotateCcw, Send, ThumbsDown } from "lucide-react";
import { TemplatePicker } from "../../components/TemplatePicker";
import { Button, ErrorBanner, Pill, cx } from "../../components/ui";
import { useSendMessage } from "../../data/useOutreach";
import type { MessageTemplate } from "../../domain/outreach";
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

type Panel = "none" | "snooze" | "lost" | "message";

type WorklistRowProps = {
  item: WorklistItem;
  currency: string;
  templates: MessageTemplate[];
  onUpdate: (patch: RecoveryItemPatch) => void;
};

export const WorklistRow = ({ item, currency, templates, onUpdate }: WorklistRowProps) => {
  const [panel, setPanel] = useState<Panel>("none");
  const [queued, setQueued] = useState(false);
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

        {queued && (
          <p className="mt-2 flex items-center gap-1 text-xs text-rr-recovered-ink" role="status">
            <Check size={13} />
            WhatsApp message queued. It goes out within a minute, outside quiet hours.
          </p>
        )}

        {panel === "message" && item.contactPhone && (
          <MessagePanel
            item={item}
            phone={item.contactPhone}
            templates={templates}
            onCancel={() => setPanel("none")}
            onQueued={() => {
              setPanel("none");
              setQueued(true);
            }}
          />
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
      <Button
        variant="outline"
        disabled={!item.contactPhone}
        title={item.contactPhone ? undefined : "No phone number on file"}
        aria-expanded={panel === "message"}
        onClick={() => setPanel(panel === "message" ? "none" : "message")}
      >
        <MessageCircle size={15} />
        Message
      </Button>
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

/** Templates for this leak type first; general templates (no leak type) are offered too. */
const templatesFor = (item: WorklistItem, templates: MessageTemplate[]): MessageTemplate[] => {
  const active = templates.filter((template) => template.isActive);
  const matching = active.filter((template) => template.leakType === item.leakType || template.leakType === null);
  return matching.length > 0 ? matching : active;
};

const MessagePanel = ({
  item,
  phone,
  templates,
  onCancel,
  onQueued,
}: {
  item: WorklistItem;
  phone: string;
  templates: MessageTemplate[];
  onCancel: () => void;
  onQueued: () => void;
}) => {
  const options = templatesFor(item, templates);
  const [templateId, setTemplateId] = useState(options[0]?.id ?? "");
  const send = useSendMessage();
  const firstName = item.patientName.split(" ")[0] ?? "";

  if (options.length === 0) {
    return <p className="mt-2 text-sm text-rr-ink-soft">No active WhatsApp templates. Add one in Automations.</p>;
  }

  return (
    <div className="mt-3 flex max-w-xl flex-col gap-3 rounded-xl border border-rr-line p-3">
      <TemplatePicker
        templates={options}
        value={templateId}
        onChange={setTemplateId}
        previewValues={firstName ? { patient_first_name: firstName } : undefined}
      />
      {send.isError && <ErrorBanner message={send.error.message} onDismiss={() => send.reset()} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!templateId || send.isPending}
          onClick={() =>
            send.mutate(
              { kind: "template", contactPhone: phone, templateId, recoveryItemId: item.id },
              { onSuccess: onQueued },
            )
          }
        >
          <Send size={15} />
          {send.isPending ? "Queuing…" : "Send on WhatsApp"}
        </Button>
      </div>
    </div>
  );
};
