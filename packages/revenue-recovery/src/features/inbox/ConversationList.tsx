import { cx } from "../../components/ui";
import type { Conversation } from "../../domain/outreach";
import { phoneDigits } from "../../domain/outreach";
import { formatAgeShort } from "../../lib/time";

type ConversationListProps = {
  conversations: Conversation[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  className?: string;
};

export const ConversationList = ({ conversations, selectedPhone, onSelect, className }: ConversationListProps) => (
  <nav aria-label="Conversations" className={cx("min-h-0 overflow-y-auto border-rr-line md:border-r", className)}>
    <ul className="divide-y divide-rr-line">
      {conversations.map((conversation) => {
        const selected = selectedPhone !== null && phoneDigits(selectedPhone) === phoneDigits(conversation.contactPhone);
        const waiting = conversation.unhandledCount > 0;
        return (
          <li key={conversation.contactPhone}>
            <button
              type="button"
              onClick={() => onSelect(conversation.contactPhone)}
              aria-current={selected ? "true" : undefined}
              className={cx(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                selected ? "bg-rr-primary-soft" : "hover:bg-rr-bg",
              )}
            >
              <span
                className={cx(
                  "grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
                  waiting ? "bg-rr-primary text-white" : "bg-rr-bg text-rr-ink-soft",
                )}
                aria-hidden
              >
                {conversation.contactName.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "#"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("truncate text-sm", waiting ? "font-semibold" : "font-medium")}>
                    {conversation.contactName}
                  </span>
                  <span className="shrink-0 text-xs text-rr-ink-faint">{formatAgeShort(conversation.lastAt)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cx("truncate text-[13px]", waiting ? "text-rr-ink" : "text-rr-ink-faint")}>
                    {conversation.lastDirection === "outbound" && "You: "}
                    {conversation.lastBody ?? ""}
                  </span>
                  {waiting && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-rr-primary px-1.5 text-[11px] font-semibold text-white">
                      {conversation.unhandledCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
