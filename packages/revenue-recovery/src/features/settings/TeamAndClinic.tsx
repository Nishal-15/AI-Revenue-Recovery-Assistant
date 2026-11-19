import { useState, type FormEvent } from "react";
import { Check, Save, Trash2, UserPlus } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { Field, INPUT } from "../../components/Form";
import { Button, Card, ErrorBanner, cx } from "../../components/ui";
import {
  ROLE_LABELS,
  canManage,
  useAddTeamMember,
  useClinicProfile,
  useMyRole,
  useRemoveTeamMember,
  useSaveClinicProfile,
  useTeam,
  type ClinicProfile,
  type StaffRole,
} from "../../data/useTeam";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Colombo", "Europe/London", "America/New_York"];

export const ClinicDetails = () => {
  const profile = useClinicProfile();
  const role = useMyRole();
  if (profile.isPending) return <Card className="h-48 animate-pulse">{null}</Card>;
  if (profile.isError) return <ErrorBanner message={profile.error.message} />;
  return <ClinicForm key={JSON.stringify(profile.data)} initial={profile.data} editable={canManage(role)} />;
};

const ClinicForm = ({ initial, editable }: { initial: ClinicProfile; editable: boolean }) => {
  const save = useSaveClinicProfile();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (key: keyof ClinicProfile) => (value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(form, { onSuccess: () => setSaved(true) });
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <header className="px-5 pt-5 sm:px-6">
          <h2 className="text-xl font-bold">Your clinic</h2>
          <p className="text-rr-ink-soft">The name patients see in reminders, and where to reach you.</p>
        </header>
        <fieldset disabled={!editable} className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <Field label="Clinic name">
            {(id) => <input id={id} required value={form.name} onChange={(e) => set("name")(e.target.value)} className={INPUT} />}
          </Field>
          <Field label="Phone for patients" optional>
            {(id) => <input id={id} type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} className={INPUT} />}
          </Field>
          <Field label="WhatsApp Business number" optional hint="The number patients reply to.">
            {(id) => <input id={id} type="tel" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber")(e.target.value)} className={INPUT} />}
          </Field>
          <Field label="Time zone" hint="Reminders follow this clock.">
            {(id) => (
              <select id={id} value={form.timezone} onChange={(e) => set("timezone")(e.target.value)} className={INPUT}>
                {[...new Set([form.timezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace("_", " ")}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Address" optional className="sm:col-span-2">
            {(id) => <input id={id} value={form.address} onChange={(e) => set("address")(e.target.value)} className={INPUT} />}
          </Field>
        </fieldset>
        {save.isError && (
          <div className="px-5 sm:px-6">
            <ErrorBanner message={save.error.message} />
          </div>
        )}
        {editable ? (
          <div className="flex items-center justify-end gap-3 px-5 pb-5 sm:px-6">
            {saved && !dirty && (
              <p className="flex items-center gap-1 text-sm text-rr-recovered-ink" role="status">
                <Check size={15} aria-hidden /> Saved
              </p>
            )}
            <Button type="submit" disabled={!dirty || save.isPending}>
              <Save size={15} aria-hidden /> {save.isPending ? "Saving…" : "Save clinic"}
            </Button>
          </div>
        ) : (
          <p className="px-5 pb-5 text-sm text-rr-ink-faint sm:px-6">Only owners and managers can change these.</p>
        )}
      </form>
    </Card>
  );
};

export const TeamSection = () => {
  const team = useTeam();
  const role = useMyRole();
  const add = useAddTeamMember();
  const remove = useRemoveTeamMember();
  const [form, setForm] = useState({ email: "", fullName: "", role: "front_desk" as StaffRole });
  const [adding, setAdding] = useState(false);
  const manager = canManage(role);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(form, {
      onSuccess: () => {
        setForm({ email: "", fullName: "", role: "front_desk" });
        setAdding(false);
      },
    });
  };

  return (
    <Card>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="text-xl font-bold">Team</h2>
          <p className="text-rr-ink-soft">Everyone who can sign in and look after patients.</p>
        </div>
        {manager && !adding && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus size={15} aria-hidden /> Add someone
          </Button>
        )}
      </header>

      {adding && (
        <form onSubmit={submit} className="mx-5 mt-5 flex flex-col gap-4 rounded-2xl bg-rr-bg p-4 sm:mx-6">
          <p className="text-sm text-rr-ink-soft">
            They first create their own account on the sign-up page with this email. Then add them here.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email">
              {(id) => <input id={id} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />}
            </Field>
            <Field label="Name">
              {(id) => <input id={id} required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT} />}
            </Field>
            <Field label="Role">
              {(id) => (
                <select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })} className={INPUT}>
                  {(Object.keys(ROLE_LABELS) as StaffRole[])
                    .filter((value) => value !== "owner" || role === "owner")
                    .map((value) => (
                      <option key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </option>
                    ))}
                </select>
              )}
            </Field>
          </div>
          {add.isError && <ErrorBanner message={add.error.message} />}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                add.reset();
                setAdding(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add to team"}
            </Button>
          </div>
        </form>
      )}

      {team.isError && (
        <div className="px-5 pt-4 sm:px-6">
          <ErrorBanner message={team.error.message} />
        </div>
      )}
      {remove.isError && (
        <div className="px-5 pt-4 sm:px-6">
          <ErrorBanner message={remove.error.message} onDismiss={() => remove.reset()} />
        </div>
      )}

      <ul className="flex flex-col px-5 py-4 sm:px-6">
        {(team.data ?? []).map((member) => (
          <li key={member.userId} className="flex items-center gap-3 border-b border-rr-line py-3 last:border-0">
            <Avatar name={member.fullName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {member.fullName} {member.isYou && <span className="font-normal text-rr-ink-faint">(you)</span>}
              </p>
              <p className="truncate text-sm text-rr-ink-soft">{member.email}</p>
            </div>
            <span
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold",
                member.role === "owner" ? "bg-rr-primary-soft text-rr-primary-strong" : "bg-rr-bg text-rr-ink-soft",
              )}
            >
              {ROLE_LABELS[member.role]}
            </span>
            {manager && !member.isYou && (member.role !== "owner" || role === "owner") && (
              <button
                type="button"
                onClick={() => window.confirm(`Remove ${member.fullName} from the team? They won't be able to sign in to this clinic.`) && remove.mutate(member.userId)}
                aria-label={`Remove ${member.fullName}`}
                className="grid size-9 place-items-center rounded-full text-rr-ink-faint hover:bg-rr-missed-soft hover:text-rr-missed-ink"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
