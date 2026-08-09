import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Only ever holds the publishable anon key.
 *
 * Sign-in itself happens through a Server Action (see app/admin/login/actions.ts)
 * so that session cookies are httpOnly. This client exists for the small number
 * of client-side auth affordances that need it and is deliberately never used
 * to query `event_rsvps`.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase is not configured.");
  }

  return createBrowserClient(url, anonKey);
}
