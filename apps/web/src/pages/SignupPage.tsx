import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { AUTH_INPUT, AuthField, AuthLayout, NotConfigured, Notice, PRIMARY_BUTTON } from "../components/AuthLayout";
import { Link, navigate } from "../lib/router";
import { friendlyAuthError } from "../lib/session";
import { supabase } from "../lib/supabase";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "confirm"; email: string };

const MIN_PASSWORD = 8;

export const SignupPage = () => {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", agreed: false });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (form.password.length < MIN_PASSWORD) return setStatus({ kind: "error", text: `Please use at least ${MIN_PASSWORD} characters for the password.` });
    if (!form.agreed) return setStatus({ kind: "error", text: "Please accept the terms and privacy policy to continue." });
    setStatus({ kind: "busy" });
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.fullName.trim() }, emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    // Supabase hides whether an email is taken: an existing address comes back with no identities.
    if (data.user && data.user.identities?.length === 0)
      return setStatus({ kind: "error", text: "There's already an account with this email. Sign in instead." });
    if (data.session) return navigate("/onboarding");
    setStatus({ kind: "confirm", email: form.email.trim() });
  };

  if (status.kind === "confirm") {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a confirmation link to ${status.email}.`}>
        <div className="flex flex-col items-start gap-5">
          <span className="grid size-14 place-items-center rounded-2xl bg-rr-surface text-rr-primary">
            <MailCheck size={26} aria-hidden />
          </span>
          <p className="text-rr-on-canvas-soft">
            Open the link to confirm your account. It brings you straight back here to set up your clinic. No email after a
            few minutes? Check the spam folder.
          </p>
          <Link href="/login" className="font-semibold underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const busy = status.kind === "busy";

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your clinic in two minutes. No card needed."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-rr-on-canvas underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!supabase ? (
        <NotConfigured />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <AuthField label="Your name">
            <input required autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Dr Anjali Rao" className={AUTH_INPUT} />
          </AuthField>
          <AuthField label="Work email">
            <input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={AUTH_INPUT} />
          </AuthField>
          <AuthField label="Password">
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              className={AUTH_INPUT}
            />
          </AuthField>
          <PasswordMeter password={form.password} />
          <label className="flex cursor-pointer items-start gap-3 text-rr-on-canvas-soft">
            <input
              type="checkbox"
              checked={form.agreed}
              onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
              className="mt-1 size-4 shrink-0 accent-[var(--color-rr-recovered)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="text-rr-on-canvas underline underline-offset-4">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-rr-on-canvas underline underline-offset-4">
                privacy policy
              </Link>
              .
            </span>
          </label>

          {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}

          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-1`}>
            {busy ? "Creating your account…" : "Create account"}
          </button>
          <p className="text-center text-sm text-rr-on-canvas-soft">
            Joining your clinic&apos;s team? Create your account here, then ask the clinic owner to add your email.
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

const PasswordMeter = ({ password }: { password: string }) => {
  if (!password) return null;
  const score = [password.length >= 8, password.length >= 12, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d|[^\w]/.test(password)].filter(Boolean).length;
  const label = ["Too short", "Okay", "Good", "Strong", "Very strong"][score];
  const colour = score <= 1 ? "bg-rr-missed" : score === 2 ? "bg-rr-risk" : "bg-rr-recovered";
  return (
    <div className="-mt-2 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-full ${index < score ? colour : "bg-rr-glass-strong"}`} />
        ))}
      </div>
      <span className="text-sm text-rr-on-canvas-soft">{label}</span>
    </div>
  );
};
