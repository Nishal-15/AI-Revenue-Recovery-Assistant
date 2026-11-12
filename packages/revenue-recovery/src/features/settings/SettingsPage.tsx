import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Check, Save } from "lucide-react";
import { Button, Card, ErrorBanner, ListSkeleton } from "../../components/ui";
import { useClinicSettings, useSaveClinicSettings } from "../../data/useAutomations";
import type { ClinicSettings } from "../../domain/outreach";
import { Switch } from "../../components/Switch";

export const SettingsPage = () => {
  const settings = useClinicSettings();
  // Lives here, not in the form: saving refetches settings, which re-mounts the form.
  const [justSaved, setJustSaved] = useState(false);

  if (settings.isPending) return <ListSkeleton rows={3} label="Loading settings" />;
  if (settings.isError) return <ErrorBanner message={settings.error.message} />;

  // Re-mount the form when saved values change so it never shows stale input.
  return (
    <SettingsForm
      key={JSON.stringify(settings.data)}
      initial={settings.data}
      justSaved={justSaved}
      onSaved={() => setJustSaved(true)}
      onEdit={() => setJustSaved(false)}
    />
  );
};

type NumberField = keyof Pick<
  ClinicSettings,
  | "maxMessagesPerWeek"
  | "attributionWindowDays"
  | "enquiryResponseSlaMinutes"
  | "unconfirmedLookaheadHours"
  | "lapsedGraceDays"
  | "messageRetentionDays"
>;

type SettingsFormProps = {
  initial: ClinicSettings;
  justSaved: boolean;
  onSaved: () => void;
  onEdit: () => void;
};

const SettingsForm = ({ initial, justSaved, onSaved, onEdit }: SettingsFormProps) => {
  const save = useSaveClinicSettings();
  const [form, setForm] = useState<ClinicSettings>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <Key extends keyof ClinicSettings>(key: Key, value: ClinicSettings[Key]) => {
    onEdit();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setNumber = (key: NumberField) => (value: string) => {
    const parsed = Number.parseInt(value, 10);
    set(key, Number.isNaN(parsed) ? 0 : parsed);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(form, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Section title="Messaging" subtitle="Protects patients from too many or badly timed messages.">
        <Field label="Quiet hours start" hint="No messages from this time…">
          {(id) => (
            <input id={id} type="time" required value={form.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Quiet hours end" hint="…until this time, clinic local time">
          {(id) => (
            <input id={id} type="time" required value={form.quietHoursEnd} onChange={(e) => set("quietHoursEnd", e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Automated messages per patient per week" hint="0 to 14. Staff replies are not counted.">
          {(id) => (
            <input id={id} type="number" min={0} max={14} required value={form.maxMessagesPerWeek} onChange={(e) => setNumber("maxMessagesPerWeek")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div>
            <p className="text-sm font-medium">Staff approval for automated messages</p>
            <p className="text-xs text-rr-ink-faint">
              When on, reminders wait in the WhatsApp inbox until someone approves them.
            </p>
          </div>
          <Switch
            checked={form.requireStaffApproval}
            onToggle={() => set("requireStaffApproval", !form.requireStaffApproval)}
            label="Staff approval for automated messages"
          />
        </div>
      </Section>

      <Section title="Detection" subtitle="When something counts as slipping away.">
        <Field label="Reply to enquiries within (minutes)" hint="After this, an unanswered enquiry is flagged.">
          {(id) => (
            <input id={id} type="number" min={1} required value={form.enquiryResponseSlaMinutes} onChange={(e) => setNumber("enquiryResponseSlaMinutes")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Check confirmations (hours ahead)" hint="Unconfirmed appointments within this window are flagged.">
          {(id) => (
            <input id={id} type="number" min={1} required value={form.unconfirmedLookaheadHours} onChange={(e) => setNumber("unconfirmedLookaheadHours")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Grace period for planned follow-ups (days)" hint="How overdue before a patient counts as not returned.">
          {(id) => (
            <input id={id} type="number" min={0} required value={form.lapsedGraceDays} onChange={(e) => setNumber("lapsedGraceDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Credit bookings to outreach for (days)" hint="1 to 90. Used for recovered revenue.">
          {(id) => (
            <input id={id} type="number" min={1} max={90} required value={form.attributionWindowDays} onChange={(e) => setNumber("attributionWindowDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
      </Section>

      <Section title="Privacy" subtitle="What leaves the clinic, and how long message text is kept.">
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div>
            <p className="text-sm font-medium">AI assistance (Google Gemini)</p>
            <p className="text-xs text-rr-ink-faint">
              When on, patients' WhatsApp messages and enquiries are sent to Google Gemini to label them and draft
              replies. Phone numbers are never sent. Turn off to keep all message text inside the clinic's systems.
            </p>
          </div>
          <Switch
            checked={form.aiEnabled}
            onToggle={() => set("aiEnabled", !form.aiEnabled)}
            label="AI assistance (Google Gemini)"
          />
        </div>
        <Field label="Keep message text for (days)" hint="30 to 3650. Older text and AI notes are deleted; dates stay for reports.">
          {(id) => (
            <input id={id} type="number" min={30} max={3650} required value={form.messageRetentionDays} onChange={(e) => setNumber("messageRetentionDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
      </Section>

      <Section title="WhatsApp connection" subtitle="From Meta Business Manager → WhatsApp → API setup.">
        <Field label="Phone number ID" hint="Leave empty until the clinic's WhatsApp Business number is connected.">
          {(id) => (
            <input
              id={id}
              inputMode="numeric"
              value={form.whatsappPhoneNumberId ?? ""}
              onChange={(e) => set("whatsappPhoneNumberId", e.target.value || null)}
              placeholder="e.g. 106540352242922"
              className={INPUT}
            />
          )}
        </Field>
      </Section>

      {save.isError && <ErrorBanner message={save.error.message} onDismiss={() => save.reset()} />}

      <div className="flex items-center justify-end gap-3">
        {justSaved && !dirty && (
          <p className="flex items-center gap-1 text-sm text-rr-recovered-ink" role="status">
            <Check size={15} />
            Saved
          </p>
        )}
        <Button type="submit" disabled={!dirty || save.isPending}>
          <Save size={15} />
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
};

const INPUT =
  "h-9 w-full rounded-lg border border-rr-line-strong bg-rr-surface px-3 text-sm outline-none focus:border-rr-primary";

const Section = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <Card>
    <header className="border-b border-rr-line px-4 py-3.5 sm:px-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="text-[13px] text-rr-ink-faint">{subtitle}</p>
    </header>
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-4 py-4 sm:grid-cols-2 sm:px-5">{children}</div>
  </Card>
);

const Field = ({ label, hint, children }: { label: string; hint: string; children: (id: string) => ReactNode }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      <p className="text-xs text-rr-ink-faint">{hint}</p>
    </div>
  );
};
