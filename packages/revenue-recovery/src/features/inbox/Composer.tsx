import { useState, type FormEvent } from "react";
import { Lock, Send, Sparkles } from "lucide-react";
import { TemplatePicker } from "../../components/TemplatePicker";
import { Button, ErrorBanner, SegmentedControl } from "../../components/ui";
import type { Conversation, MessageTemplate } from "../../domain/outreach";
import { REPLY_WINDOW_MS, isContactOnlyTemplate, isReplyWindowOpen } from "../../domain/outreach";
import { useSendMessage } from "../../data/useOutreach";
import { formatTimeLeft } from "../../lib/time";

type ComposeMode = "text" | "template";

type ComposerProps = {
  conversation: Conversation;
  templates: MessageTemplate[];
  /** Gemini's draft for the latest unanswered message; staff review it before sending. */
  suggestion: string | null;
};

export const Composer = ({ conversation, templates, suggestion }: ComposerProps) => {
  const send = useSendMessage();
  const windowOpen = isReplyWindowOpen(conversation.lastInboundAt);
  // Appointment or treatment templates need a worklist item for their details; send those from the Worklist.
  const activeTemplates = templates.filter((template) => template.isActive && isContactOnlyTemplate(template));
  const [mode, setMode] = useState<ComposeMode>(windowOpen ? "text" : "template");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? "");
  const effectiveMode: ComposeMode = windowOpen ? mode : "template";
  const firstName = conversation.contactName.split(" ")[0] ?? "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (effectiveMode === "text") {
      const trimmed = text.trim();
      if (!trimmed) return;
      send.mutate({ kind: "text", contactPhone: conversation.contactPhone, text: trimmed }, { onSuccess: () => setText("") });
      return;
    }
    if (!templateId) return;
    send.mutate({ kind: "template", contactPhone: conversation.contactPhone, templateId, recoveryItemId: null });
  };

  const windowEndsAt = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() + REPLY_WINDOW_MS : 0;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-rr-line bg-rr-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Message type"
          value={effectiveMode}
          onChange={setMode}
          options={[
            { value: "text", label: windowOpen ? "Reply" : (<><Lock size={13} /> Reply</>) },
            { value: "template", label: "Template" },
          ]}
        />
        <p className="text-xs text-rr-ink-faint">
          {windowOpen
            ? `Free replies allowed for ${formatTimeLeft(windowEndsAt)} more`
            : "No message from them in 24 h, so WhatsApp only allows a template"}
        </p>
      </div>

      {send.isError && <ErrorBanner message={send.error.message} onDismiss={() => send.reset()} />}

      {effectiveMode === "text" && suggestion && !text && (
        <div className="flex items-start gap-3 rounded-xl border border-rr-primary/30 bg-rr-primary-soft/60 px-3 py-2.5">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-rr-primary-strong" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-rr-primary-strong">Suggested reply · check before sending</p>
            <p className="mt-0.5 text-[13px] text-rr-ink">{suggestion}</p>
          </div>
          <Button variant="outline" onClick={() => setText(suggestion)}>
            Use this
          </Button>
        </div>
      )}

      {effectiveMode === "text" ? (
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="rr-composer-text">
            Message
          </label>
          <textarea
            id="rr-composer-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={`Write to ${firstName || "the patient"}…`}
            className="min-h-11 flex-1 resize-y rounded-xl border border-rr-line-strong bg-rr-surface px-3 py-2 text-sm outline-none focus:border-rr-primary"
          />
          <Button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send reply">
            <Send size={15} />
            Send
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeTemplates.length === 0 ? (
            <p className="text-sm text-rr-ink-soft">
              No general templates. Appointment and treatment reminders are sent from the Worklist.
            </p>
          ) : (
            <TemplatePicker
              templates={activeTemplates}
              value={templateId}
              onChange={setTemplateId}
              previewValues={firstName ? { patient_first_name: firstName } : undefined}
            />
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!templateId || send.isPending}>
              <Send size={15} />
              Send template
            </Button>
          </div>
        </div>
      )}
    </form>
  );
};
