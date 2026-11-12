import { Construction } from "lucide-react";
import { Card, cx } from "../../components/ui";
import { ConfirmationsPage } from "../confirmations/ConfirmationsPage";
import { DashboardPage } from "../dashboard/DashboardPage";
import { RecallsPage } from "../recalls/RecallsPage";
import { WorklistPage } from "../worklist/WorklistPage";
import { SECTION_IDS, SECTIONS, type SectionId } from "./sections";

type ModuleShellProps = {
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
};

export const ModuleShell = ({ section, onSectionChange }: ModuleShellProps) => (
  <div className="flex min-h-full flex-col">
    <header className="border-b border-rr-line bg-rr-surface/80 px-4 pt-5 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-rr-display text-xl font-bold tracking-tight">Revenue Recovery</h1>
          <p className="text-[13px] text-rr-ink-faint">
            Find the bookings slipping away, win them back on WhatsApp.
          </p>
        </div>
      </div>
      <nav aria-label="Revenue recovery sections" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
        {SECTION_IDS.map((id) => {
          const { label, icon: Icon } = SECTIONS[id];
          const active = id === section;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-rr-primary text-rr-primary-strong"
                  : "border-transparent text-rr-ink-soft hover:text-rr-ink",
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </nav>
    </header>
    <main className="flex-1 p-4 sm:p-6">
      <SectionContent section={section} />
    </main>
  </div>
);

const SectionContent = ({ section }: { section: SectionId }) => {
  switch (section) {
    case "dashboard":
      return <DashboardPage />;
    case "worklist":
      return <WorklistPage />;
    case "confirmations":
      return <ConfirmationsPage />;
    case "recalls":
      return <RecallsPage />;
    default:
      return <PlannedSection section={section} />;
  }
};

const PlannedSection = ({ section }: { section: SectionId }) => {
  const { label, plannedPhase } = SECTIONS[section];
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-rr-primary-soft text-rr-primary">
        <Construction size={22} />
      </span>
      <h2 className="text-base font-semibold">{label}</h2>
      <p className="max-w-sm text-sm text-rr-ink-soft">Arrives in Phase {plannedPhase} of the build plan.</p>
    </Card>
  );
};
