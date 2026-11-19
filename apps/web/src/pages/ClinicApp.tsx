import { useEffect, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { RevenueRecovery } from "@dental-os/revenue-recovery";
import { Logo } from "../components/Logo";
import { Link, navigate } from "../lib/router";
import { supabase } from "../lib/supabase";

type Membership = { clinicId: string; clinicName: string; currency: string; staffName: string };

type MembershipState =
  | { kind: "loading" }
  | { kind: "ready"; membership: Membership }
  | { kind: "not-linked" }
  | { kind: "error"; text: string };

type RawMembership = {
  clinic_id: string;
  full_name: string;
  clinic: { name: string; currency: string } | { name: string; currency: string }[] | null;
};

const loadMembership = async (client: SupabaseClient, userId: string): Promise<MembershipState> => {
  const { data, error } = await client
    .schema("recovery")
    .from("clinic_staff")
    .select("clinic_id, full_name, clinic:clinics(name, currency)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  if (error) return { kind: "error", text: error.message };
  const row = (data as RawMembership[])[0];
  if (!row) return { kind: "not-linked" };
  const clinic = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
  return {
    kind: "ready",
    membership: {
      clinicId: row.clinic_id,
      clinicName: clinic?.name ?? "Your clinic",
      currency: clinic?.currency ?? "INR",
      staffName: row.full_name,
    },
  };
};

/** Sessions arrive asynchronously (and from email links), so listen rather than read once. */
const useSession = (client: SupabaseClient) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [client]);
  return session;
};

export const ClinicApp = () =>
  supabase ? (
    <SignedInArea client={supabase} />
  ) : (
    <CenteredNote>Sign-in isn&apos;t set up yet. Add the Supabase keys to apps/web/.env, then restart.</CenteredNote>
  );

const SignedInArea = ({ client }: { client: SupabaseClient }) => {
  const session = useSession(client);
  const [state, setState] = useState<MembershipState>({ kind: "loading" });
  const userId = session?.user.id;

  useEffect(() => {
    if (session === null) navigate("/login");
  }, [session]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    setState({ kind: "loading" });
    loadMembership(client, userId).then((next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [client, userId]);

  const signOut = async () => {
    await client.auth.signOut();
    navigate("/");
  };

  if (!session) return <CenteredNote>Loading…</CenteredNote>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-rr-canvas-line">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" aria-label="Revenue Recovery home">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            {state.kind === "ready" && (
              <p className="hidden text-right text-sm leading-tight sm:block">
                <span className="block font-semibold">{state.membership.clinicName}</span>
                <span className="text-rr-on-canvas-soft">{state.membership.staffName}</span>
              </p>
            )}
            <button
              type="button"
              onClick={signOut}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-rr-canvas-line px-4 text-sm transition-colors hover:bg-white/10"
            >
              <LogOut size={16} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </header>

      {state.kind === "loading" && <CenteredNote>Opening your clinic…</CenteredNote>}
      {state.kind === "error" && <CenteredNote>Couldn&apos;t open your clinic: {state.text}</CenteredNote>}
      {state.kind === "not-linked" && (
        <CenteredNote>
          You&apos;re signed in as {session.user.email}, but this account isn&apos;t linked to a clinic yet. Ask your clinic
          owner to add you.
        </CenteredNote>
      )}
      {state.kind === "ready" && (
        <RevenueRecovery supabase={client} clinicId={state.membership.clinicId} currency={state.membership.currency} />
      )}
    </div>
  );
};

const CenteredNote = ({ children }: { children: ReactNode }) => (
  <div className="grid min-h-[60vh] place-items-center px-5">
    <p role="status" className="max-w-md text-center text-lg text-rr-on-canvas-soft">
      {children}
    </p>
  </div>
);
