import { Bell, Send } from "lucide-react";
import { cx } from "../../components/ui";
import { useApprovals, useConversations } from "../../data/useOutreach";
import { useWorklist } from "../../data/useWorklist";
import { ConfirmationsPage } from "../confirmations/ConfirmationsPage";
import { InboxPage } from "../inbox/InboxPage";
import { PatientsPage } from "../patients/PatientsPage";
import { ReportsPage } from "../reports/ReportsPage";
import { SettingsPage } from "../settings/SettingsPage";
import { TodayPage } from "../today/TodayPage";
import { isInView } from "../worklist/worklistFilters";
import { SECTION_IDS, SECTIONS, type SectionId } from "./sections";

type ModuleShellProps = {
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
};

const todayLabel = () =>
  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

export const ModuleShell = ({ section, onSectionChange }: ModuleShellProps) => {
  const badges = useBadges();

  return (
    <div className="flex min-h-full flex-col text-rr-on-canvas">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 pt-6 sm:px-8 sm:pt-8">
        <div>
          <h1 className="text-4xl font-light tracking-tight sm:text-5xl">{SECTIONS[section].label}</h1>
          <p className="mt-1 text-rr-on-canvas-soft">{todayLabel()}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSectionChange("messages")}
            aria-label={badges.messages > 0 ? `Messages: ${badges.messages} waiting` : "Messages"}
            className="relative grid size-11 place-items-center rounded-full border border-rr-canvas-line bg-rr-glass text-rr-on-canvas transition-colors hover:bg-rr-glass-strong"
          >
            <Bell size={18} aria-hidden />
            {badges.messages > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rr-missed px-1 text-[11px] font-bold text-rr-ink">
                {badges.messages}
              </span>
            )}
          </button>
          {badges.approvals > 0 && (
            <button
              type="button"
              onClick={() => onSectionChange("messages")}
              className="flex h-11 items-center gap-2 rounded-full bg-rr-cta px-5 font-semibold text-rr-on-cta transition-colors hover:bg-rr-cta-hover"
            >
              <Send size={16} aria-hidden />
              Check {badges.approvals} {badges.approvals === 1 ? "reminder" : "reminders"}
            </button>
          )}
        </div>
      </header>

      <nav aria-label="Sections" className="mt-6 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:px-8 [&::-webkit-scrollbar]:hidden">
        {SECTION_IDS.map((id) => {
          const { label, icon: Icon } = SECTIONS[id];
          const active = id === section;
          const badge = id === "today" ? badges.today : id === "messages" ? badges.messages : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-11 shrink-0 items-center gap-2 rounded-full px-5 transition-colors",
                active
                  ? "bg-rr-cta font-semibold text-rr-on-cta"
                  : "border border-rr-canvas-line bg-rr-glass text-rr-on-canvas hover:bg-rr-glass-strong",
              )}
            >
              <Icon size={17} aria-hidden />
              {label}
              {badge > 0 && (
                <span
                  className={cx(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold",
                    active ? "bg-rr-ink text-rr-surface" : "bg-rr-missed text-rr-ink",
                  )}
                  aria-label={`${badge} waiting`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 px-4 pt-6 pb-12 sm:px-8">
        <SectionContent section={section} onSectionChange={onSectionChange} />
      </main>
    </div>
  );
};

/** How many things wait for a person. */
const useBadges = () => {
  const worklist = useWorklist();
  const conversations = useConversations();
  const approvals = useApprovals();
  const now = Date.now();
  const approvalCount = approvals.data?.length ?? 0;
  return {
    today: (worklist.data ?? []).filter((item) => isInView(item, "active", now)).length,
    messages: (conversations.data ?? []).filter((conversation) => conversation.unhandledCount > 0).length + approvalCount,
    approvals: approvalCount,
  };
};

const SectionContent = ({
  section,
  onSectionChange,
}: {
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
}) => {
  switch (section) {
    case "today":
      return <TodayPage onOpenMessages={() => onSectionChange("messages")} />;
    case "patients":
      return <PatientsPage />;
    case "appointments":
      return <ConfirmationsPage />;
    case "messages":
      return <InboxPage />;
    case "results":
      return <ReportsPage />;
    case "settings":
      return <SettingsPage />;
  }
};
