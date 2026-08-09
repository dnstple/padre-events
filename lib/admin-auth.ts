import "server-only";

import { createSessionClient } from "@/lib/supabase/server";

/**
 * Server-side administrator authorisation.
 *
 * Two independent gates, both checked on EVERY admin request — never once at
 * login, and never in the client:
 *   1. A valid Supabase session (verified against the auth server, not just
 *      decoded from a cookie).
 *   2. That session's email appears in the ADMIN_EMAILS allow-list.
 *
 * Middleware also redirects unauthenticated traffic away from /admin, but that
 * is a convenience, not the security boundary. Every data path re-checks here.
 */

export type AdminSession = {
  email: string;
  userId: string;
};

export type AdminAuthResult =
  | { ok: true; session: AdminSession }
  | { ok: false; reason: "unauthenticated" | "unauthorised" | "unconfigured" };

/** Parses ADMIN_EMAILS ("a@x.com, b@x.com") into a normalised set. */
export function allowedAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getAdminSession(): Promise<AdminAuthResult> {
  const allowed = allowedAdminEmails();

  // An empty allow-list must fail closed, never open.
  if (allowed.size === 0) {
    return { ok: false, reason: "unconfigured" };
  }

  let supabase;
  try {
    supabase = await createSessionClient();
  } catch {
    return { ok: false, reason: "unconfigured" };
  }

  // getUser() revalidates the JWT with Supabase. getSession() would only decode
  // the cookie, which a client could forge.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (!allowed.has(user.email.toLowerCase())) {
    return { ok: false, reason: "unauthorised" };
  }

  return { ok: true, session: { email: user.email, userId: user.id } };
}
