import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, KeyRound, LogOut, UserRound } from "lucide-react";
import { AppHeader, signOut } from "../components/AppHeader";
import { AUTH_INPUT, AuthField, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/AuthLayout";
import { Link, navigate } from "../lib/router";
import { friendlyAuthError, useMembership, useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { CenteredNote } from "./ClinicApp";

type Status = { kind: "idle" | "busy" | "saved" } | { kind: "error"; text: string };

export const AccountPage = () => {
  const session = useSession();
  const [membership, reload] = useMembership(session?.user.id);

  useEffect(() => {
    if (session === null) navigate("/login");
  }, [session]);

  if (!session) return <CenteredNote>Loading…</CenteredNote>;
  const ready = membership.kind === "ready" ? membership.membership : null;

  return (
    <div className="min-h-screen">
      <AppHeader clinicName={ready?.clinicName} staffName={ready?.staffName} email={session.user.email} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Link href="/app" className="inline-flex items-center gap-1.5 text-rr-on-canvas-soft hover:text-rr-on-canvas">
          <ArrowLeft size={17} aria-hidden /> Back to your clinic
        </Link>
        <h1 className="mt-6 text-5xl font-light tracking-tight">Your account</h1>
        <p className="mt-2 text-lg text-rr-on-canvas-soft">
          {session.user.email}
          {ready && ` · ${ready.clinicName}, ${ready.role.replace("_", " ")}`}
        </p>

        <div className="mt-10 flex flex-col gap-5">
          <Panel icon={<UserRound size={20} aria-hidden />} title="Your name" detail="How you appear to the rest of the team.">
            <NameForm key={ready?.staffName} initial={ready?.staffName ?? ""} onSaved={reload} />
          </Panel>
          <Panel icon={<KeyRound size={20} aria-hidden />} title="Password" detail="Use at least 8 characters.">
            <PasswordForm />
          </Panel>
          <Panel icon={<LogOut size={20} aria-hidden />} title="Sign out" detail="Sign out here, or on every device at once.">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={signOut} className={`${SECONDARY_BUTTON} sm:w-auto sm:px-6`}>
                Sign out
              </button>
              <button
                type="button"
                onClick={async () => {
                  await supabase?.auth.signOut({ scope: "global" });
                  navigate("/login");
                }}
                className={`${SECONDARY_BUTTON} sm:w-auto sm:px-6`}
              >
                Sign out everywhere
              </button>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
};

const Panel = ({ icon, title, detail, children }: { icon: ReactNode; title: string; detail: string; children: ReactNode }) => (
  <section className="grid gap-5 rounded-rr-card border border-rr-canvas-line bg-rr-glass p-6 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-7">
    <div>
      <span className="grid size-10 place-items-center rounded-2xl bg-rr-surface text-rr-primary">{icon}</span>
      <h2 className="mt-3 text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-rr-on-canvas-soft">{detail}</p>
    </div>
    <div>{children}</div>
  </section>
);

const NameForm = ({ initial, onSaved }: { initial: string; onSaved: () => void }) => {
  const [name, setName] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "busy" });
    const { error } = await supabase.schema("recovery").rpc("set_my_name", { p_full_name: name });
    if (error) return setStatus({ kind: "error", text: error.message });
    await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setStatus({ kind: "saved" });
    onSaved();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AuthField label="Full name">
        <input required value={name} onChange={(e) => setName(e.target.value)} className={AUTH_INPUT} />
      </AuthField>
      {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
      {status.kind === "saved" && <Notice tone="success">Saved.</Notice>}
      <button type="submit" disabled={status.kind === "busy" || name.trim() === initial} className={`${PRIMARY_BUTTON} sm:w-auto sm:self-end sm:px-6`}>
        Save name
      </button>
    </form>
  );
};

const PasswordForm = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) return setStatus({ kind: "error", text: "Please use at least 8 characters." });
    if (password !== confirm) return setStatus({ kind: "error", text: "The two passwords don't match." });
    setStatus({ kind: "busy" });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus({ kind: "error", text: friendlyAuthError(error.message) });
    setPassword("");
    setConfirm("");
    setStatus({ kind: "saved" });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AuthField label="New password">
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={AUTH_INPUT} />
      </AuthField>
      <AuthField label="Type it again">
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={AUTH_INPUT} />
      </AuthField>
      {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
      {status.kind === "saved" && <Notice tone="success">Password changed.</Notice>}
      <button type="submit" disabled={status.kind === "busy" || !password} className={`${PRIMARY_BUTTON} sm:w-auto sm:self-end sm:px-6`}>
        Change password
      </button>
    </form>
  );
};
