import { Info, Workflow } from "lucide-react";
import { Switch } from "../../components/Switch";
import { Card, EmptyState, ErrorBanner, ListSkeleton, Pill, cx } from "../../components/ui";
import { useAutomationRules, useSetRuleActive } from "../../data/useAutomations";
import { useTemplates } from "../../data/useOutreach";
import { LEAK_META, TONE_CLASSES } from "../../domain/leaks";
import type { AutomationRule, AutomationStep, MessageTemplate } from "../../domain/outreach";
import { previewTemplate } from "../../domain/outreach";
import type { LeakType } from "../../domain/types";

const formatDuration = (minutes: number): string => {
  const abs = Math.abs(minutes);
  if (abs % 1440 === 0) return `${abs / 1440} ${abs === 1440 ? "day" : "days"}`;
  if (abs % 60 === 0) return `${abs / 60} ${abs === 60 ? "hour" : "hours"}`;
  return `${abs} min`;
};

const DUE_NOUNS: Partial<Record<LeakType, string>> = { unconfirmed_appointment: "the appointment" };

export const describeStep = (step: AutomationStep, leakType: LeakType): string => {
  if (step.anchor === "detected") {
    return step.offsetMinutes === 0 ? "As soon as it is found" : `${formatDuration(step.offsetMinutes)} after it is found`;
  }
  const noun = DUE_NOUNS[leakType] ?? "the due date";
  if (step.offsetMinutes === 0) return `At ${noun}`;
  return `${formatDuration(step.offsetMinutes)} ${step.offsetMinutes < 0 ? "before" : "after"} ${noun}`;
};

export const AutomationsPage = () => {
  const rules = useAutomationRules();
  const templates = useTemplates();
  const setActive = useSetRuleActive();

  if (rules.isPending || templates.isPending) return <ListSkeleton label="Loading automations" />;
  if (rules.isError) return <ErrorBanner message={rules.error.message} />;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-start gap-3 p-4 sm:p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rr-primary-soft text-rr-primary">
          <Info size={18} />
        </span>
        <div className="text-[13px] text-rr-ink-soft">
          <p>
            Each sequence sends WhatsApp templates while an item stays open. It stops as soon as the patient replies,
            confirms or books, or when staff resolve or snooze the item. Quiet hours, weekly limits and opt-outs from
            Settings always apply.
          </p>
          <p className="mt-1">
            Overdue follow-ups are callbacks staff promised, so they are never automated.
          </p>
        </div>
      </Card>

      {setActive.isError && <ErrorBanner message={setActive.error.message} onDismiss={() => setActive.reset()} />}

      {rules.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Workflow size={22} />} title="No automations yet" />
        </Card>
      ) : (
        rules.data.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            templates={templates.data ?? []}
            onToggle={() => setActive.mutate({ id: rule.id, isActive: !rule.isActive })}
            busy={setActive.isPending}
          />
        ))
      )}
    </div>
  );
};

const RuleCard = ({
  rule,
  templates,
  onToggle,
  busy,
}: {
  rule: AutomationRule;
  templates: MessageTemplate[];
  onToggle: () => void;
  busy: boolean;
}) => {
  const meta = LEAK_META[rule.leakType];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;

  return (
    <Card className={cx(!rule.isActive && "opacity-75")}>
      <header className="flex items-center gap-3 border-b border-rr-line px-4 py-3.5 sm:px-5">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{rule.name}</h2>
          <p className="text-[13px] text-rr-ink-faint">{meta.label}</p>
        </div>
        <Switch checked={rule.isActive} onToggle={onToggle} disabled={busy} label={`${rule.name} automation`} />
      </header>
      <ol className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {rule.steps.map((step, index) => {
          const template = templates.find((candidate) => candidate.id === step.templateId);
          return (
            <li key={`${step.templateId}-${index}`} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rr-bg text-xs font-semibold text-rr-ink-soft">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{describeStep(step, rule.leakType)}</p>
                  {template ? (
                    <Pill tone="neutral">{template.name}</Pill>
                  ) : (
                    <Pill tone="missed">Template missing</Pill>
                  )}
                </div>
                {template && (
                  <>
                    <p className="mt-1.5 rounded-xl border border-rr-line bg-rr-bg px-3 py-2 text-[13px] text-rr-ink-soft">
                      {previewTemplate(template)}
                    </p>
                    <p className="mt-1 text-xs text-rr-ink-faint">
                      Meta template name:{" "}
                      <code className="rounded bg-rr-bg px-1 py-0.5 font-mono">{template.whatsappTemplateName ?? "not set"}</code>
                      {template.buttons.length > 0 && ` · Buttons: ${template.buttons.join(", ")}`}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};
