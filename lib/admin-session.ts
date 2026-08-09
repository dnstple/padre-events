import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Administrator session.
 *
 * There is no user database, so the guest list is protected by one shared
 * password. For a private party that is the right size of tool:
 * nothing to provision, nobody to invite, and revoking access is one env var
 * change plus a redeploy.
 *
 * The cookie is an HMAC over an expiry timestamp. It carries no secret and
 * cannot be forged without ADMIN_SESSION_SECRET, and because the expiry is
 * inside the signed payload it cannot be extended by editing the cookie.
 */

export const ADMIN_COOKIE = "padre65_admin";
const SESSION_HOURS = 12;

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || null;
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && secret());
}

/** Constant-time string comparison that does not leak length via early exit. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, so hash first to equalise.
  const hashA = createHmac("sha256", "compare").update(bufA).digest();
  const hashB = createHmac("sha256", "compare").update(bufB).digest();
  return timingSafeEqual(hashA, hashB);
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Returns the cookie value for a fresh session. */
export function issueSession(): { value: string; maxAge: number } | null {
  const key = secret();
  if (!key) return null;

  const expiresAt = Date.now() + SESSION_HOURS * 3600_000;
  const payload = String(expiresAt);
  return {
    value: `${payload}.${sign(payload, key)}`,
    maxAge: SESSION_HOURS * 3600,
  };
}

/** Verifies a cookie value. Returns false for tampered or expired sessions. */
export function verifySession(cookieValue: string | undefined): boolean {
  const key = secret();
  if (!key || !cookieValue) return false;

  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return false;

  if (!safeEqual(signature, sign(payload, key))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
