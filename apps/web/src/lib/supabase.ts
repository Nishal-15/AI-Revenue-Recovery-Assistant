import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

/** A legacy JWT key says its role in the middle part; "service_role" must never reach a browser. */
const isLegacyServiceKey = (value: string): boolean => {
  const payload = value.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
};

export type ConnectionProblem = "missing-url" | "bad-url" | "missing-key" | "secret-key" | null;

const findProblem = (): ConnectionProblem => {
  if (!url) return "missing-url";
  if (!/^https:\/\/[^/]+$/.test(url.replace(/\/+$/, ""))) return "bad-url";
  if (!key) return "missing-key";
  // The secret key bypasses every privacy rule; anyone could read it from the website, so refuse it.
  if (key.startsWith("sb_secret_") || isLegacyServiceKey(key)) return "secret-key";
  return null;
};

export const connectionProblem: ConnectionProblem = findProblem();

/** Null until apps/web/.env is complete and safe; the sign-in pages then explain exactly what to fix. */
export const supabase: SupabaseClient | null =
  connectionProblem === null ? createClient(url.replace(/\/+$/, ""), key, { auth: { persistSession: true } }) : null;
