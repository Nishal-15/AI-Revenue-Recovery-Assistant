import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, navigate } from "../lib/router";
import { supabase } from "../lib/supabase";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "sent"; email: string };

/** Supabase's wording is technical; staff see plain sentences instead. */
const friendlyError = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) return "That email and password don't match. Check them and try again.";
  if (lower.includes("email not confirmed")) return "This email hasn't been confirmed yet. Open the confirmation email first.";
  if (lower.includes("signups not allowed") || lower.includes("user not found"))
    return "There is no account for this email. Ask your clinic owner to add you.";
  if (lower.includes("rate limit")) return "Too many tries. Wait a minute and try again.";
  if (lower.includes("fetch")) return "Couldn't reach the server. Check the internet connection.";
  return message;
};

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Already signed in? Go straight to the clinic.
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
    if (error) return setStatus({ kind: "error", text: friendlyError(error.message) });
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
    if (error) return setStatus({ kind: "error", text: friendlyError(error.message) });
    setStatus({ kind: "sent", email: email.trim() });
  };

  const busy = status.kind === "busy";

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(60rem_40rem_at_80%_-10%,rgb(79_165_138/0.22),transparent_60%)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="Revenue Recovery home">
          <Logo />
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-rr-on-canvas-soft hover:text-rr-on-canvas">
          <ArrowLeft size={17} aria-hidden /> Back
        </Link>
      </header>

      <main className="grid flex-1 place-items-center px-5 pb-16">
        <div className="w-full max-w-md rounded-rr-card bg-rr-surface p-7 text-rr-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] sm:p-9">
          <h1 className="text-3xl font-light tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-rr-ink-soft">Sign in to see which patients need you today.</p>

          {!supabase ? (
            <p role="alert" className="mt-6 rounded-2xl bg-rr-risk-soft p-4 text-rr-risk-ink">
              Sign-in isn&apos;t set up yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env, then restart.
            </p>
          ) : status.kind === "sent" ? (
            <div role="status" className="mt-6 rounded-2xl bg-rr-recovered-soft p-5">
              <p className="flex items-center gap-2 font-semibold">
                <Mail size={18} aria-hidden /> Check your email
              </p>
              <p className="mt-1.5 text-rr-ink-soft">
                We sent a sign-in link to {status.email}. Open it on this device to continue.
              </p>
              <button type="button" className="mt-3 font-semibold text-rr-primary-strong underline" onClick={() => setStatus({ kind: "idle" })}>
                Use a password instead
              </button>
            </div>
          ) : (
            <form className="mt-7 flex flex-col gap-4" onSubmit={signIn}>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 rounded-2xl border border-rr-line-strong bg-white px-4 outline-none focus:border-rr-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 rounded-2xl border border-rr-line-strong bg-white px-4 outline-none focus:border-rr-primary"
                />
              </label>

              {status.kind === "error" && (
                <p role="alert" className="rounded-2xl bg-rr-missed-soft px-4 py-3 text-rr-missed-ink">
                  {status.text}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-2 h-12 rounded-full bg-rr-primary font-semibold text-white transition-colors hover:bg-rr-primary-strong disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendLink}
                className="h-12 rounded-full border border-rr-line-strong font-semibold transition-colors hover:bg-rr-bg disabled:opacity-60"
              >
                Email me a sign-in link
              </button>
              <p className="text-center text-sm text-rr-ink-soft">No account? Ask your clinic owner to add you.</p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
