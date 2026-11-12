import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { Button, Card, ErrorBanner, Pill } from "../../components/ui";
import type { ApprovalItem, MessageTemplate } from "../../domain/outreach";
import { useApproveMessages, useCancelMessage } from "../../data/useOutreach";
import { formatAgeShort } from "../../lib/time";

type ApprovalQueueProps = {
  items: ApprovalItem[];
  templates: MessageTemplate[];
};

/** Automated reminders wait here while "Staff approval" is on in Settings. */
export const ApprovalQueue = ({ items, templates }: ApprovalQueueProps) => {
  const approve = useApproveMessages();
  const cancel = useCancelMessage();
  const templateName = (id: string | null) => templates.find((template) => template.id === id)?.name ?? "Message";
  const error = approve.error ?? cancel.error;

  return (
    <Card>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rr-line px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-rr-risk-soft text-rr-risk-ink">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">Waiting for your approval · {items.length}</h2>
            <p className="text-[13px] text-rr-ink-faint">Automated reminders go out only after someone approves them.</p>
          </div>
        </div>
        <Button onClick={() => approve.mutate(items.map((item) => item.id))} disabled={approve.isPending}>
          <Check size={15} />
          Approve all
        </Button>
      </header>

      {error && (
        <div className="px-4 pt-3 sm:px-5">
          <ErrorBanner message={error.message} onDismiss={() => (approve.reset(), cancel.reset())} />
        </div>
      )}

      <ul className="divide-y divide-rr-line">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{item.contactName}</p>
                <Pill tone="info">
                  <Bot size={12} />
                  {templateName(item.templateId)}
                </Pill>
                <span className="text-xs text-rr-ink-faint">{formatAgeShort(item.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-rr-ink-soft">{item.body}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => approve.mutate([item.id])} disabled={approve.isPending}>
                <Check size={15} />
                Approve
              </Button>
              <Button variant="ghost" onClick={() => cancel.mutate(item.id)} disabled={cancel.isPending}>
                <X size={15} />
                Don&apos;t send
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
