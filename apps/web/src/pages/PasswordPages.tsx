import { useEffect, useState, type FormEvent } from "react";
import { AUTH_INPUT, AuthField, AuthLayout, NotConfigured, Notice, PRIMARY_BUTTON } from "../components/AuthLayout";
import { Link, navigate } from "../lib/router";
import { friendlyAuthError, useSession } from "../lib/session";
import { supabase } from "../lib/supabase";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "sent" } | { kind: "error"; text: string }>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "busy" });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    setStatus({ kind: "sent" });
  };

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link href="/login" className="font-semibold text-rr-on-canvas underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!supabase ? (
        <NotConfigured />
      ) : status.kind === "sent" ? (
        <Notice tone="success">
          If an account uses {email.trim()}, a reset link is on its way. Open it on this device. Check spam if it doesn&apos;t
          arrive in a few minutes.
        </Notice>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <AuthField label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={AUTH_INPUT} />
          </AuthField>
          {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
          <button type="submit" disabled={status.kind === "busy"} className={PRIMARY_BUTTON}>
            {status.kind === "busy" ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};

/** Opened from the reset email: Supabase signs the person in from the link, then they choose a password. */
export const ResetPasswordPage = () => {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; text: string }>({ kind: "idle" });
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaitedTooLong(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) return setStatus({ kind: "error", text: "Please use at least 8 characters." });
    if (password !== confirm) return setStatus({ kind: "error", text: "The two passwords don't match." });
    setStatus({ kind: "busy" });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    setStatus({ kind: "done" });
    window.setTimeout(() => navigate("/app"), 1500);
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 8 characters.">
      {!supabase ? (
        <NotConfigured />
      ) : status.kind === "done" ? (
        <Notice tone="success">Password changed. Taking you to your clinic…</Notice>
      ) : !session ? (
        waitedTooLong ? (
          <div className="flex flex-col gap-4">
            <Notice tone="error">This reset link has expired or was already used. Ask for a new one.</Notice>
            <Link href="/forgot-password" className={PRIMARY_BUTTON}>
              Send a new link
            </Link>
          </div>
        ) : (
          <p className="text-rr-on-canvas-soft">Checking your link…</p>
        )
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <AuthField label="New password">
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={AUTH_INPUT} />
          </AuthField>
          <AuthField label="Type it again">
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={AUTH_INPUT} />
          </AuthField>
          {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
          <button type="submit" disabled={status.kind === "busy"} className={PRIMARY_BUTTON}>
            {status.kind === "busy" ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};
