import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-backed Supabase client used ONLY for administrator authentication.
 *
 * It runs with the anon key, so it can read the signed-in admin's session but
 * it can never read `event_rsvps` — RLS denies that table to every role except
 * the service role. Guest data is fetched separately via `createAdminClient()`
 * after the session has been verified.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            });
          }
        } catch {
          // `cookies().set()` throws when called from a Server Component.
          // Middleware refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}
