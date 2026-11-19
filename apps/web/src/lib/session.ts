import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** undefined while loading, null when signed out. Listens so email links and sign-outs update every page. */
export const useSession = (): Session | null | undefined => {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
};

export type Membership = { clinicId: string; clinicName: string; currency: string; staffName: string; role: string };

export type MembershipState =
  | { kind: "loading" }
  | { kind: "ready"; membership: Membership }
  | { kind: "none" }
  | { kind: "error"; text: string };

type RawMembership = {
  clinic_id: string;
  full_name: string;
  role: string;
  clinic: { name: string; currency: string } | { name: string; currency: string }[] | null;
};

export const loadMembership = async (client: SupabaseClient, userId: string): Promise<MembershipState> => {
  const { data, error } = await client
    .schema("recovery")
    .from("clinic_staff")
    .select("clinic_id, full_name, role, clinic:clinics(name, currency)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  if (error) {
    const hint = error.message.toLowerCase().includes("schema")
      ? " In Supabase, add \"recovery\" under Project Settings → Data API → Exposed schemas."
      : "";
    return { kind: "error", text: `${error.message}.${hint}` };
  }
  const row = (data as RawMembership[])[0];
  if (!row) return { kind: "none" };
  const clinic = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
  return {
    kind: "ready",
    membership: {
      clinicId: row.clinic_id,
      clinicName: clinic?.name ?? "Your clinic",
      currency: clinic?.currency?.trim() || "INR",
      staffName: row.full_name,
      role: row.role,
    },
  };
};

export const useMembership = (userId: string | undefined): [MembershipState, () => void] => {
  const [state, setState] = useState<MembershipState>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) return;
    let current = true;
    setState({ kind: "loading" });
    loadMembership(supabase, userId).then((next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [userId, version]);
  return [state, () => setVersion((value) => value + 1)];
};

/** Supabase's wording is technical; people see plain sentences instead. */
export const friendlyAuthError = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes("invalid api key") || lower.includes("no api key") || lower.includes("unregistered api key"))
    return "Supabase didn't accept the key in apps/web/.env. Copy the Publishable key again from Project Settings → API Keys, save, and restart npm run dev.";
  if (lower.includes("signups not allowed for this instance") || lower.includes("signup is disabled") || lower.includes("signups are disabled"))
    return "New sign-ups are switched off in Supabase. Turn on Authentication → Sign In / Providers → Email → Allow new users to sign up.";
  if (lower.includes("email logins are disabled") || lower.includes("email provider is disabled"))
    return "Email sign-in is switched off in Supabase. Turn on Authentication → Sign In / Providers → Email.";
  if (lower.includes("error sending") || lower.includes("sending confirmation") || lower.includes("sending magic link") || lower.includes("sending recovery"))
    return "Supabase couldn't send the email. Without your own email sender it only sends a few emails an hour, and only to members of your Supabase team. Set up SMTP under Authentication → Emails.";
  if (lower.includes("invalid login")) return "That email and password don't match. Check them and try again.";
  if (lower.includes("email not confirmed")) return "Please confirm your email first. Open the link we sent you.";
  if (lower.includes("already registered") || lower.includes("already been registered"))
    return "There's already an account with this email. Sign in instead.";
  if (lower.includes("signups not allowed") || lower.includes("user not found"))
    return "There is no account for this email yet. Create one first.";
  if (lower.includes("password should") || lower.includes("weak password")) return "Please choose a longer password (at least 8 characters).";
  if (lower.includes("same password")) return "That's your current password. Choose a new one.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (lower.includes("fetch") || lower.includes("network")) return "Couldn't reach the server. Check the internet connection.";
  return message;
};
