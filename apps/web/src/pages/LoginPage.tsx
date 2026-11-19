import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import { AUTH_INPUT, AuthField, AuthLayout, NotConfigured, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/AuthLayout";
import { Link, navigate } from "../lib/router";
import { friendlyAuthError } from "../lib/session";
import { supabase } from "../lib/supabase";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "sent"; email: string };

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/app");
    });
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "busy" });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    navigate("/app");
  };

  const sendLink = async () => {
    if (!supabase) return;
    if (!email.trim()) return setStatus({ kind: "error", text: "Type your email first, then press the link button." });
    setStatus({ kind: "busy" });
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/app` },
    });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    setStatus({ kind: "sent", email: email.trim() });
  };

  const busy = status.kind === "busy";

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see which patients need you today."
      footer={
        <>
          New to Revenue Recovery?{" "}
          <Link href="/signup" className="font-semibold text-rr-on-canvas underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {!supabase ? (
        <NotConfigured />
      ) : status.kind === "sent" ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success">
            <span className="flex items-center gap-2 font-semibold">
              <Mail size={18} aria-hidden /> Check your email
            </span>
            We sent a sign-in link to {status.email}. Open it on this device.
          </Notice>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => setStatus({ kind: "idle" })}>
            Use my password instead
          </button>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={signIn}>
          <AuthField label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={AUTH_INPUT} />
          </AuthField>
          <AuthField
            label="Password"
            aside={
              <Link href="/forgot-password" className="text-sm font-normal text-rr-on-canvas-soft hover:text-rr-on-canvas">
                Forgot password?
              </Link>
            }
          >
            <span className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${AUTH_INPUT} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-rr-on-canvas-soft hover:text-rr-on-canvas"
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </span>
          </AuthField>

          {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}

          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mt-1`}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center gap-3 text-sm text-rr-on-canvas-soft" aria-hidden>
            <span className="h-px flex-1 bg-rr-canvas-line" /> or <span className="h-px flex-1 bg-rr-canvas-line" />
          </div>
          <button type="button" disabled={busy} onClick={sendLink} className={SECONDARY_BUTTON}>
            <Mail size={17} aria-hidden /> Email me a sign-in link
          </button>
        </form>
      )}
    </AuthLayout>
  );
};
