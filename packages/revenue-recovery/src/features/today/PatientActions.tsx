import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AlarmClock, Check, MessageCircle, Phone, RotateCcw, Send, X } from "lucide-react";
import { TemplatePicker } from "../../components/TemplatePicker";
import { Button, ButtonLink, ErrorBanner, cx } from "../../components/ui";
import { useSendMessage } from "../../data/useOutreach";
import type { MessageTemplate } from "../../domain/outreach";
import type { RecoveryItemPatch, WorklistItem } from "../../domain/types";

const HOUR_MS = 3_600_000;

const LATER_OPTIONS = [
  { label: "Tomorrow", hours: 24 },
  { label: "In 3 days", hours: 72 },
  { label: "Next week", hours: 168 },
] as const;

type Panel = "none" | "message" | "later" | "not-coming";

type PatientActionsProps = {
  item: WorklistItem;
  templates: MessageTemplate[];
  onUpdate: (patch: RecoveryItemPatch) => void;
  /** The "Next up" card uses bigger buttons. */
  size?: "large" | "normal";
};

const isFinished = (item: WorklistItem) =>
  item.status === "recovered" || item.status === "lost" || item.status === "dismissed";

const isLater = (item: WorklistItem) =>
  item.snoozedUntil !== null && new Date(item.snoozedUntil).getTime() > Date.now();

export const PatientActions = ({ item, templates, onUpdate, size = "normal" }: PatientActionsProps) => {
  const [panel, setPanel] = useState<Panel>("none");
  const [messageSent, setMessageSent] = useState(false);
  const big = size === "large";
  const buttonSize = big ? "h-11 px-5 text-[15px]" : "";

  const update = (patch: RecoveryItemPatch) => {
    setPanel("none");
    onUpdate(patch);
  };
  const toggle = (next: Panel) => setPanel(panel === next ? "none" : next);

  if (isFinished(item)) {
    return (
      <Button variant="outline" onClick={() => update({ status: "open", resolutionNote: null })}>
        <RotateCcw size={15} />
        Move back to To do
      </Button>
    );
  }

  const phoneDigits = (item.contactPhone ?? "").replace(/\D/g, "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className={buttonSize}
          disabled={!phoneDigits}
          title={phoneDigits ? undefined : "No phone number saved for this patient"}
          aria-expanded={panel === "message"}
          onClick={() => toggle("message")}
        >
          <MessageCircle size={big ? 18 : 15} />
          Send WhatsApp
        </Button>
        {phoneDigits && (
          <ButtonLink variant="outline" className={buttonSize} href={`tel:+${phoneDigits}`}>
            <Phone size={big ? 18 : 15} />
            Call
          </ButtonLink>
        )}
        {!phoneDigits && <span className="text-sm text-rr-ink-faint">No phone number saved</span>}
      </div>

      {messageSent && (
        <p className="flex items-center gap-1.5 text-sm text-rr-recovered-ink" role="status">
          <Check size={15} />
          Message sent to WhatsApp. It goes out within a minute (never at night).
        </p>
      )}

      {panel === "message" && (
        <MessagePanel
          item={item}
          phone={item.contactPhone ?? ""}
          templates={templates}
          onCancel={() => setPanel("none")}
          onSent={() => {
            setPanel("none");
            setMessageSent(true);
            if (item.status === "open") onUpdate({ status: "in_progress" });
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2" role="group" aria-label="How did it go?">
        <span className="mr-1 text-sm text-rr-ink-soft">How did it go?</span>
        <OutcomeButton onClick={() => update({ status: "recovered" })} tone="good">
          <Check size={15} />
          Booked
        </OutcomeButton>
        <OutcomeButton onClick={() => toggle("not-coming")} expanded={panel === "not-coming"}>
          <X size={15} />
          Not coming
        </OutcomeButton>
        <OutcomeButton onClick={() => update({ status: "dismissed" })}>Not needed</OutcomeButton>
        {isLater(item) ? (
          <OutcomeButton onClick={() => update({ snoozedUntil: null })}>
            <AlarmClock size={15} />
            Bring back now
          </OutcomeButton>
        ) : (
          <OutcomeButton onClick={() => toggle("later")} expanded={panel === "later"}>
            <AlarmClock size={15} />
            Remind me later
          </OutcomeButton>
        )}
      </div>

      {panel === "later" && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Remind me">
          {LATER_OPTIONS.map((option) => (
            <Button
              key={option.label}
              variant="outline"
              onClick={() => update({ snoozedUntil: new Date(Date.now() + option.hours * HOUR_MS).toISOString() })}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {panel === "not-coming" && (
        <NotComingForm
          onCancel={() => setPanel("none")}
          onSave={(note) => update({ status: "lost", resolutionNote: note })}
        />
      )}
    </div>
  );
};

const OutcomeButton = ({
  children,
  onClick,
  tone = "plain",
  expanded,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "good" | "plain";
  expanded?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={expanded}
    className={cx(
      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
      tone === "good"
        ? "border-rr-recovered/40 bg-rr-recovered-soft text-rr-recovered-ink hover:border-rr-recovered"
        : "border-rr-line-strong bg-rr-surface text-rr-ink-soft hover:border-rr-ink-faint hover:text-rr-ink",
      expanded && "border-rr-ink text-rr-ink",
    )}
  >
    {children}
  </button>
);

const NotComingForm = ({ onSave, onCancel }: { onSave: (note: string | null) => void; onCancel: () => void }) => {
  const [note, setNote] = useState("");
  const inputId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(note.trim() || null);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-rr-ink-soft">
          Reason, if they gave one
        </label>
        <input
          id={inputId}
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="For example: moved to another city"
          className="h-10 rounded-xl border border-rr-line-strong bg-rr-surface px-3 outline-none focus:border-rr-primary"
        />
      </div>
      <Button type="submit">Save</Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
};

/** Messages that fit this kind of patient first; general ones are offered too. */
const messagesFor = (item: WorklistItem, templates: MessageTemplate[]): MessageTemplate[] => {
  const active = templates.filter((template) => template.isActive);
  const matching = active.filter((template) => template.leakType === item.leakType || template.leakType === null);
  return matching.length > 0 ? matching : active;
};

const MessagePanel = ({
  item,
  phone,
  templates,
  onCancel,
  onSent,
}: {
  item: WorklistItem;
  phone: string;
  templates: MessageTemplate[];
  onCancel: () => void;
  onSent: () => void;
}) => {
  const options = messagesFor(item, templates);
  const [templateId, setTemplateId] = useState(options[0]?.id ?? "");
  const send = useSendMessage();
  const firstName = item.patientName.split(" ")[0] ?? "";

  if (options.length === 0) {
    return <p className="text-sm text-rr-ink-soft">No messages are set up yet. Add them under Settings.</p>;
  }

  return (
    <div className="flex max-w-xl flex-col gap-3 rounded-2xl bg-rr-bg p-4">
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
            send.mutate({ kind: "template", contactPhone: phone, templateId, recoveryItemId: item.id }, { onSuccess: onSent })
          }
        >
          <Send size={15} />
          {send.isPending ? "Sending…" : `Send to ${firstName || "patient"}`}
        </Button>
      </div>
    </div>
  );
};
