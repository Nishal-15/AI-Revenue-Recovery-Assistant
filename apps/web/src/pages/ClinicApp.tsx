import { useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RevenueRecovery } from "@dental-os/revenue-recovery";
import { AppHeader } from "../components/AppHeader";
import { SignatureIntro, shouldShowIntro } from "../components/SignatureIntro";
import { Link, navigate } from "../lib/router";
import { useMembership, useSession, type Membership, type MembershipState } from "../lib/session";
import { supabase } from "../lib/supabase";

export const ClinicApp = () =>
  supabase ? (
    <SignedInArea client={supabase} />
  ) : (
    <CenteredNote>
      Sign-in isn&apos;t connected yet. Add the Supabase keys to apps/web/.env, then restart.{" "}
      <Link href="/" className="underline">
        Back to the home page
      </Link>
    </CenteredNote>
  );

const SignedInArea = ({ client }: { client: SupabaseClient }) => {
  const session = useSession();
  const [membership] = useMembership(session?.user.id);

  useEffect(() => {
    if (session === null) navigate("/login");
  }, [session]);
  useEffect(() => {
    if (membership.kind === "none") navigate("/onboarding");
  }, [membership]);

  if (!session) return <CenteredNote>Loading…</CenteredNote>;
  const ready = membership.kind === "ready" ? membership.membership : null;
  return <ClinicScreens ready={ready} membership={membership} email={session.user.email} client={client} />;
};

const ClinicScreens = ({
  ready,
  membership,
  email,
  client,
}: {
  ready: Membership | null;
  membership: MembershipState;
  email: string | undefined;
  client: SupabaseClient;
}) => {
  // Decided once per clinic: the intro plays over the app while today's data loads underneath.
  const [introFor, setIntroFor] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    if (ready && introFor === null) setIntroFor(shouldShowIntro(ready.clinicId) ? ready.clinicId : "");
  }, [ready, introFor]);

  return (
    <div className="min-h-screen">
      {ready && introFor === ready.clinicId && !introDone && (
        <SignatureIntro clinicId={ready.clinicId} clinicName={ready.clinicName} staffName={ready.staffName} onDone={() => setIntroDone(true)} />
      )}
      <AppHeader clinicName={ready?.clinicName} staffName={ready?.staffName} email={email} />
      {membership.kind === "loading" && <AppSkeleton />}
      {membership.kind === "error" && <CenteredNote>Couldn&apos;t open your clinic. {membership.text}</CenteredNote>}
      {ready && (
        <div className="mx-auto max-w-[90rem]">
          <RevenueRecovery supabase={client} clinicId={ready.clinicId} currency={ready.currency} />
        </div>
      )}
    </div>
  );
};

const AppSkeleton = () => (
  <div className="mx-auto flex max-w-[90rem] animate-pulse flex-col gap-6 px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Opening your clinic">
    <div className="h-12 w-56 rounded-full bg-rr-glass-strong" />
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="h-11 w-28 rounded-full bg-rr-glass" />
      ))}
    </div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-24 rounded-3xl bg-rr-glass" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-rr-glass" />
    </div>
  </div>
);

export const CenteredNote = ({ children }: { children: ReactNode }) => (
  <div className="grid min-h-[60vh] place-items-center px-5">
    <p role="status" className="max-w-md text-center text-lg text-rr-on-canvas-soft">
      {children}
    </p>
  </div>
);
