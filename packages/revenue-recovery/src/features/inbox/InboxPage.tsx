import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Card, EmptyState, ErrorBanner, ListSkeleton, cx } from "../../components/ui";
import { phoneDigits } from "../../domain/outreach";
import { useApprovals, useConversations, useTemplates } from "../../data/useOutreach";
import { ApprovalQueue } from "./ApprovalQueue";
import { ConversationList } from "./ConversationList";
import { Thread } from "./Thread";

export const InboxPage = () => {
  const conversations = useConversations();
  const approvals = useApprovals();
  const templates = useTemplates();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  if (conversations.isPending) return <ListSkeleton label="Loading WhatsApp inbox" />;
  if (conversations.isError) return <ErrorBanner message={conversations.error.message} />;

  const list = conversations.data;
  const selected =
    selectedPhone === null ? undefined : list.find((c) => phoneDigits(c.contactPhone) === phoneDigits(selectedPhone));
  const waitingCount = list.filter((conversation) => conversation.unhandledCount > 0).length;

  return (
    <div className="flex flex-col gap-4">
      {approvals.data && approvals.data.length > 0 && (
        <ApprovalQueue items={approvals.data} templates={templates.data ?? []} />
      )}

      <Card className="overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-rr-line px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold">Conversations</h2>
          <p className="text-[13px] text-rr-ink-faint">
            {waitingCount > 0 ? `${waitingCount} waiting for a reply` : "Everyone has a reply"}
          </p>
        </header>
        {list.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title="No WhatsApp conversations yet"
            body="Reminders and patient replies will appear here."
          />
        ) : (
          <div className="grid h-[min(680px,calc(100vh-180px))] min-h-[480px] grid-cols-1 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
            <ConversationList
              conversations={list}
              selectedPhone={selected?.contactPhone ?? null}
              onSelect={setSelectedPhone}
              className={cx(selected && "hidden md:block")}
            />
            {selected ? (
              <Thread
                conversation={selected}
                templates={templates.data ?? []}
                onBack={() => setSelectedPhone(null)}
              />
            ) : (
              <div className="hidden place-items-center bg-rr-bg md:grid">
                <p className="text-sm text-rr-ink-faint">Choose a conversation to read and reply.</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
