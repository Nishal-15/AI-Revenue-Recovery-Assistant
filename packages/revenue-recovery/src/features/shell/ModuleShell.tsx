import { cx } from "../../components/ui";
import { useApprovals, useConversations } from "../../data/useOutreach";
import { useWorklist } from "../../data/useWorklist";
import { ConfirmationsPage } from "../confirmations/ConfirmationsPage";
import { InboxPage } from "../inbox/InboxPage";
import { ReportsPage } from "../reports/ReportsPage";
import { SettingsPage } from "../settings/SettingsPage";
import { TodayPage } from "../today/TodayPage";
import { isInView } from "../worklist/worklistFilters";
import { SECTION_IDS, SECTIONS, type SectionId } from "./sections";

type ModuleShellProps = {
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
};

export const ModuleShell = ({ section, onSectionChange }: ModuleShellProps) => {
  const badges = useBadges();

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-4 pt-5 sm:px-8 sm:pt-7">
        <p className="font-rr-display text-[15px] font-bold text-rr-primary-strong">Revenue Recovery</p>
        <nav aria-label="Sections" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {SECTION_IDS.map((id) => {
            const { label, icon: Icon } = SECTIONS[id];
            const active = id === section;
            const badge = badges[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSectionChange(id)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] transition-colors",
                  active
                    ? "bg-rr-ink font-bold text-white"
                    : "text-rr-ink-soft hover:bg-rr-surface hover:text-rr-ink",
                )}
              >
                <Icon size={17} aria-hidden />
                {label}
                {badge > 0 && (
                  <span
                    className={cx(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold",
                      active ? "bg-rr-risk text-rr-ink" : "bg-rr-risk-soft text-rr-risk-ink",
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
      </header>
      <main className="flex-1 px-4 pt-5 pb-10 sm:px-8">
        <SectionContent section={section} onSectionChange={onSectionChange} />
      </main>
    </div>
  );
};

/** How many things wait for a person on each tab. */
const useBadges = (): Record<SectionId, number> => {
  const worklist = useWorklist();
  const conversations = useConversations();
  const approvals = useApprovals();
  const now = Date.now();
  return {
    today: (worklist.data ?? []).filter((item) => isInView(item, "active", now)).length,
    appointments: 0,
    messages:
      (conversations.data ?? []).filter((conversation) => conversation.unhandledCount > 0).length +
      (approvals.data?.length ?? 0),
    results: 0,
    settings: 0,
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
