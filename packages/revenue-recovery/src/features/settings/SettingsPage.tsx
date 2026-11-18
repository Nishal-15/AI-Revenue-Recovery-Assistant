import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Check, Save } from "lucide-react";
import { Button, Card, ErrorBanner, ListSkeleton } from "../../components/ui";
import { useClinicSettings, useSaveClinicSettings } from "../../data/useAutomations";
import type { ClinicSettings } from "../../domain/outreach";
import { Switch } from "../../components/Switch";
import { AutomationsPage } from "../automations/AutomationsPage";

export const SettingsPage = () => {
  const settings = useClinicSettings();
  // Lives here, not in the form: saving refetches settings, which re-mounts the form.
  const [justSaved, setJustSaved] = useState(false);

  if (settings.isPending) return <ListSkeleton rows={3} label="Loading settings" />;
  if (settings.isError) return <ErrorBanner message={settings.error.message} />;

  // Re-mount the form when saved values change so it never shows stale input.
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <SettingsForm
        key={JSON.stringify(settings.data)}
        initial={settings.data}
        justSaved={justSaved}
        onSaved={() => setJustSaved(true)}
        onEdit={() => setJustSaved(false)}
      />
      <section aria-labelledby="rr-auto-reminders" className="flex flex-col gap-4">
        <div>
          <h2 id="rr-auto-reminders" className="font-rr-display text-2xl font-bold">Automatic reminders</h2>
          <p className="text-rr-ink-soft">The WhatsApp messages sent for you, and when they go out.</p>
        </div>
        <AutomationsPage />
      </section>
    </div>
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
      <Section title="WhatsApp messages" subtitle="So patients never get too many messages, or messages at night.">
        <Field label="No messages after" hint="Messages wait until morning.">
          {(id) => (
            <input id={id} type="time" required value={form.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Start sending again at" hint="Clinic time.">
          {(id) => (
            <input id={id} type="time" required value={form.quietHoursEnd} onChange={(e) => set("quietHoursEnd", e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Most automatic reminders one patient gets in a week" hint="Between 0 and 14. Your own replies don't count.">
          {(id) => (
            <input id={id} type="number" min={0} max={14} required value={form.maxMessagesPerWeek} onChange={(e) => setNumber("maxMessagesPerWeek")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div>
            <p className="font-medium">Check reminders before they are sent</p>
            <p className="text-sm text-rr-ink-faint">
              On: reminders wait under Messages until you press Send. Off: they go out by themselves.
            </p>
          </div>
          <Switch
            checked={form.requireStaffApproval}
            onToggle={() => set("requireStaffApproval", !form.requireStaffApproval)}
            label="Check reminders before they are sent"
          />
        </div>
      </Section>

      <Section title="When to add a patient to Today" subtitle="How long to wait before someone needs following up.">
        <Field label="Unanswered message, after (minutes)" hint="A question nobody has answered for this long appears on Today.">
          {(id) => (
            <input id={id} type="number" min={1} required value={form.enquiryResponseSlaMinutes} onChange={(e) => setNumber("enquiryResponseSlaMinutes")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Ask to confirm appointments (hours ahead)" hint="Appointments within this time that aren't confirmed appear on Today.">
          {(id) => (
            <input id={id} type="number" min={1} required value={form.unconfirmedLookaheadHours} onChange={(e) => setNumber("unconfirmedLookaheadHours")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Missed check-up or next treatment, after (days late)" hint="Patients this many days late appear on Today.">
          {(id) => (
            <input id={id} type="number" min={0} required value={form.lapsedGraceDays} onChange={(e) => setNumber("lapsedGraceDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Count a booking as won back within (days)" hint="If the patient books within this many days of your message or call, it counts in Results.">
          {(id) => (
            <input id={id} type="number" min={1} max={90} required value={form.attributionWindowDays} onChange={(e) => setNumber("attributionWindowDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
      </Section>

      <Section title="Privacy" subtitle="What leaves the clinic, and how long messages are kept.">
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div>
            <p className="font-medium">Smart suggestions</p>
            <p className="text-sm text-rr-ink-faint">
              Reads patients' messages and suggests replies, using Google's AI (Gemini). Phone numbers are never shared.
              Turn off to keep every message inside the clinic.
            </p>
          </div>
          <Switch
            checked={form.aiEnabled}
            onToggle={() => set("aiEnabled", !form.aiEnabled)}
            label="Smart suggestions"
          />
        </div>
        <Field label="Delete old messages after (days)" hint="Between 30 and 3650. Results still count them.">
          {(id) => (
            <input id={id} type="number" min={30} max={3650} required value={form.messageRetentionDays} onChange={(e) => setNumber("messageRetentionDays")(e.target.value)} className={INPUT} />
          )}
        </Field>
      </Section>

      <Section title="WhatsApp connection" subtitle="Set once when the clinic's WhatsApp Business number is connected.">
        <Field label="WhatsApp phone number ID" hint="Found in Meta's WhatsApp setup page. Leave empty until then.">
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
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
};

const INPUT =
  "h-11 w-full rounded-xl border border-rr-line-strong bg-rr-surface px-3.5 outline-none focus:border-rr-primary";

const Section = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <Card>
    <header className="px-5 pt-5 sm:px-6">
      <h2 className="font-rr-display text-xl font-bold">{title}</h2>
      <p className="text-rr-ink-soft">{subtitle}</p>
    </header>
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-5 py-5 sm:grid-cols-2 sm:px-6">{children}</div>
  </Card>
);

const Field = ({ label, hint, children }: { label: string; hint: string; children: (id: string) => ReactNode }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children(id)}
      <p className="text-sm text-rr-ink-faint">{hint}</p>
    </div>
  );
};
