import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

/**
 * Supabase Client Instance (Gracefully falls back if not yet configured)
 */
let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return clientInstance;
}

export const supabase = getSupabaseClient();
