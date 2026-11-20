import { useState, type FormEvent } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { AUTH_INPUT, AuthField, AuthLayout, NotConfigured, Notice, OrDivider, PRIMARY_BUTTON } from "../components/AuthLayout";
import { SocialSignIn } from "../components/SocialSignIn";
import { Link, navigate } from "../lib/router";
import { friendlyAuthError } from "../lib/session";
import { supabase } from "../lib/supabase";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "confirm"; email: string };

const MIN_PASSWORD = 8;

const TermsLinks = () => (
  <>
    <Link href="/terms" className="text-rr-on-canvas underline underline-offset-4">
      terms
    </Link>{" "}
    and{" "}
    <Link href="/privacy" className="text-rr-on-canvas underline underline-offset-4">
      privacy policy
    </Link>
  </>
);

export const SignupPage = () => {
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (form.password.length < MIN_PASSWORD) return setStatus({ kind: "error", text: `Please use at least ${MIN_PASSWORD} characters for the password.` });
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
      tab="signup"
      title="Create your account"
      subtitle="Set up your clinic in two minutes. No card needed."
      footer="Joining a clinic's team? Sign up, then ask the owner to add your email."
    >
      {!supabase ? (
        <NotConfigured />
      ) : (
        <>
          <SocialSignIn />
          <OrDivider />
          <form className="flex flex-col gap-3.5" onSubmit={submit}>
            <div className="grid gap-3.5 sm:grid-cols-2">
            <AuthField label="Your name">
              <input
                required
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Dr Anjali Rao"
                className={AUTH_INPUT}
              />
            </AuthField>
            <AuthField label="Work email">
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@clinic.com"
                className={AUTH_INPUT}
              />
            </AuthField>
            </div>
            <AuthField label="Password" aside={<PasswordStrength password={form.password} />}>
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

            {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}

            <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-1`}>
              {busy ? "Creating your account…" : "Create account"} {!busy && <ArrowRight size={18} aria-hidden />}
            </button>
            <p className="text-center text-xs text-rr-on-canvas-soft">
              By continuing, with email, Google or Apple, you agree to the <TermsLinks />.
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  );
};

/** A small four-step bar beside the Password label, so it costs no extra row. */
const PasswordStrength = ({ password }: { password: string }) => {
  if (!password) return null;
  const score = [password.length >= 8, password.length >= 12, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d|[^\w]/.test(password)].filter(Boolean).length;
  const label = ["Too short", "Okay", "Good", "Strong", "Very strong"][score];
  const colour = score <= 1 ? "bg-rr-missed" : score === 2 ? "bg-rr-risk" : "bg-rr-recovered";
  return (
    <span className="flex items-center gap-2 text-sm font-normal text-rr-on-canvas-soft" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`h-1.5 w-5 rounded-full ${index < score ? colour : "bg-rr-glass-strong"}`} />
        ))}
      </span>
      {label}
    </span>
  );
};
