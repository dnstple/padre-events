import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * SERVER ONLY. The `server-only` import above makes the build fail loudly if
 * this module is ever pulled into a client component, so the service-role key
 * cannot reach the browser bundle.
 *
 * This client bypasses Row Level Security, which is exactly why RLS on
 * `event_rsvps` can deny everything to `anon` and `authenticated`.
 */

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "padre65-events" } },
  });

  return cached;
}

/** True when the server has everything it needs to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
