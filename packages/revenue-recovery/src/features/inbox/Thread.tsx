import { useEffect, useRef } from "react";
import { ArrowLeft, Bot, CheckCheck } from "lucide-react";
import { Button, ErrorBanner, cx } from "../../components/ui";
import type { Conversation, MessageStatus, MessageTemplate, OutreachMessage } from "../../domain/outreach";
import { useMarkHandled, useThread } from "../../data/useOutreach";
import { formatMessageTime } from "../../lib/time";
import { Composer } from "./Composer";

const STATUS_LABELS = {
  queued: "Queued · sends within a minute",
  awaiting_approval: "Awaiting approval",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  replied: "Replied",
  failed: "Not sent",
  cancelled: "Cancelled",
} as const satisfies Record<MessageStatus, string>;

type ThreadProps = {
  conversation: Conversation;
  templates: MessageTemplate[];
  onBack: () => void;
  className?: string;
};

export const Thread = ({ conversation, templates, onBack, className }: ThreadProps) => {
  const { data: messages = [], isPending, isError, error } = useThread(conversation.contactPhone);
  const markHandled = useMarkHandled();
  const scrollRef = useRef<HTMLDivElement>(null);
  const unhandledIds = messages.filter((m) => m.direction === "inbound" && m.handledAt === null).map((m) => m.id);
  const templateName = (id: string | null) => templates.find((template) => template.id === id)?.name ?? null;

  // Scroll only the message pane; scrollIntoView could also scroll the host app around the module.
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages.length]);

  return (
    <section aria-label={`Conversation with ${conversation.contactName}`} className={cx("flex min-h-0 flex-col", className)}>
      <header className="flex items-center gap-3 border-b border-rr-line px-3 py-3 sm:px-4">
        <Button variant="ghost" className="px-2 md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{conversation.contactName}</h2>
          <p className="text-xs text-rr-ink-faint">{conversation.contactPhone}</p>
        </div>
        {unhandledIds.length > 0 && (
          <Button variant="outline" onClick={() => markHandled.mutate(unhandledIds)} disabled={markHandled.isPending}>
            <CheckCheck size={15} />
            Mark handled
          </Button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-rr-bg px-3 py-4 sm:px-5">
        {isError && <ErrorBanner message={error.message} />}
        {isPending ? (
          <p className="py-10 text-center text-sm text-rr-ink-faint">Loading messages…</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} templateName={templateName(message.templateId)} />
            ))}
          </ol>
        )}
      </div>

      <Composer key={conversation.contactPhone} conversation={conversation} templates={templates} />
    </section>
  );
};

const MessageBubble = ({ message, templateName }: { message: OutreachMessage; templateName: string | null }) => {
  const outbound = message.direction === "outbound";
  const failed = message.status === "failed" || message.status === "cancelled";

  return (
    <li className={cx("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-rr-card sm:max-w-[70%]",
          outbound ? "rounded-br-md bg-rr-primary-soft" : "rounded-bl-md border border-rr-line bg-rr-surface",
          failed && "border border-rr-missed/40",
        )}
      >
        {outbound && (message.automated || templateName) && (
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-rr-primary-strong">
            {message.automated && <Bot size={12} />}
            {message.automated ? "Automated" : "Template"}
            {templateName && ` · ${templateName}`}
          </p>
        )}
        <p className="text-sm whitespace-pre-line text-rr-ink">{message.body ?? "(no text)"}</p>
        <p className={cx("mt-1 text-right text-[11px]", failed ? "text-rr-missed-ink" : "text-rr-ink-faint")}>
          {formatMessageTime(message.sentAt ?? message.createdAt)}
          {outbound && ` · ${STATUS_LABELS[message.status]}`}
          {!outbound && message.handledAt === null && " · Needs reply"}
        </p>
        {message.error && <p className="mt-1 text-xs text-rr-missed-ink">{message.error}</p>}
      </div>
    </li>
  );
};
