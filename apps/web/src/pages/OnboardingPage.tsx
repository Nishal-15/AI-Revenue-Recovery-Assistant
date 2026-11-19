import { useEffect, useState, type FormEvent } from "react";
import { Building2, RefreshCw, UsersRound } from "lucide-react";
import { AUTH_INPUT, AuthField, AuthLayout, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/AuthLayout";
import { navigate } from "../lib/router";
import { useMembership, useSession } from "../lib/session";
import { supabase } from "../lib/supabase";

const CURRENCIES = ["INR", "AED", "USD", "GBP", "EUR", "SGD", "LKR", "NPR", "BDT"];
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

/** After sign-up: create a clinic, or wait to be added to one. */
export const OnboardingPage = () => {
  const session = useSession();
  const [membership, recheck] = useMembership(session?.user.id);

  useEffect(() => {
    if (session === null) navigate("/login");
  }, [session]);
  useEffect(() => {
    if (membership.kind === "ready") navigate("/app");
  }, [membership]);

  if (!session || membership.kind === "loading" || membership.kind === "ready") {
    return (
      <AuthLayout title="One moment…">
        <p className="text-rr-on-canvas-soft">Getting things ready.</p>
      </AuthLayout>
    );
  }

  const metaName = typeof session.user.user_metadata.full_name === "string" ? session.user.user_metadata.full_name : "";

  return (
    <AuthLayout title="Set up your clinic" subtitle="This takes a minute. You can change everything later in Settings.">
      {membership.kind === "error" && (
        <div className="mb-5">
          <Notice tone="error">{membership.text}</Notice>
        </div>
      )}
      <CreateClinicForm defaultOwnerName={metaName} onCreated={() => navigate("/app")} />
      <div className="mt-8 rounded-3xl border border-rr-canvas-line bg-white/[0.04] p-5">
        <p className="flex items-center gap-2 font-semibold">
          <UsersRound size={18} aria-hidden /> Joining an existing clinic?
        </p>
        <p className="mt-1.5 text-rr-on-canvas-soft">
          Ask the clinic owner to add <span className="text-rr-on-canvas">{session.user.email}</span> under Settings → Team.
          Then press the button below.
        </p>
        <button type="button" onClick={recheck} className={`${SECONDARY_BUTTON} mt-4`}>
          <RefreshCw size={16} aria-hidden /> I&apos;ve been added, check again
        </button>
      </div>
    </AuthLayout>
  );
};

const CreateClinicForm = ({ defaultOwnerName, onCreated }: { defaultOwnerName: string; onCreated: () => void }) => {
  const [form, setForm] = useState({
    clinicName: "",
    ownerName: defaultOwnerName,
    phone: "",
    whatsapp: "",
    timezone: browserZone(),
    currency: "INR",
  });
  const [status, setStatus] = useState<{ kind: "idle" | "busy" } | { kind: "error"; text: string }>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "busy" });
    const { error } = await supabase.schema("recovery").rpc("create_clinic", {
      p_name: form.clinicName,
      p_owner_name: form.ownerName,
      p_phone: form.phone || null,
      p_whatsapp_number: form.whatsapp || null,
      p_timezone: form.timezone,
      p_currency: form.currency,
    });
    if (error) return setStatus({ kind: "error", text: error.message });
    if (form.ownerName.trim() && form.ownerName.trim() !== defaultOwnerName) {
      await supabase.auth.updateUser({ data: { full_name: form.ownerName.trim() } });
    }
    onCreated();
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <AuthField label="Clinic name">
        <input required value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} placeholder="Bright Smile Dental" className={AUTH_INPUT} />
      </AuthField>
      <AuthField label="Your name, as patients and the team see it">
        <input required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className={AUTH_INPUT} />
      </AuthField>
      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField label="Clinic phone">
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 80 1234 5678" className={AUTH_INPUT} />
        </AuthField>
        <AuthField label="WhatsApp Business number">
          <input type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="Can add later" className={AUTH_INPUT} />
        </AuthField>
        <AuthField label="Time zone">
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={`${AUTH_INPUT} [&>option]:text-rr-ink`}>
            {[...new Set([form.timezone, "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Colombo", "Asia/Kathmandu", "Asia/Dhaka", "Europe/London"])].map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace("_", " ")}
              </option>
            ))}
          </select>
        </AuthField>
        <AuthField label="Currency">
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`${AUTH_INPUT} [&>option]:text-rr-ink`}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </AuthField>
      </div>
      {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
      <button type="submit" disabled={status.kind === "busy"} className={PRIMARY_BUTTON}>
        <Building2 size={17} aria-hidden />
        {status.kind === "busy" ? "Setting up…" : "Create my clinic"}
      </button>
      <p className="text-sm text-rr-on-canvas-soft">
        We add three ready-made WhatsApp reminders for you: appointment confirmations, enquiry follow-ups and next-visit
        reminders.
      </p>
    </form>
  );
};
