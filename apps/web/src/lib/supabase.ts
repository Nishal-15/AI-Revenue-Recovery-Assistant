import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null until apps/web/.env has the project URL and publishable key; the sign-in page then explains what to add. */
export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey, { auth: { persistSession: true } }) : null;
