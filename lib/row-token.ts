import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived, signed reference to one row of the sheet.
 *
 * The newsletter form appears after the response has already been written, so
 * adding an email address means updating the row that was just appended. The
 * browser therefore has to tell the server which row — and a row number the
 * browser can choose is a way to overwrite somebody else's cells.
 *
 * So the row number is signed here and verified on the way back. The token
 * grants exactly one thing: permission to write columns M and N of that one
 * row, for thirty minutes. It carries no personal data, so it is not a
 * disclosure risk if it leaks; the worst an attacker can do with a stolen token
 * is overwrite the email address of the guest who was given it.
 */

/** Long enough for someone to read the confirmation and decide. */
const TTL_MS = 30 * 60 * 1000;

/**
 * There is no dedicated secret for this and no good reason to make the
 * organiser generate another one. ADMIN_SESSION_SECRET is the natural choice
 * and is set in every real deployment; the service-account key is the fallback,
 * because it is guaranteed present whenever the sheet works at all. Both are
 * high-entropy server-only values, and only HMAC outputs are ever published.
 */
function key(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.GOOGLE_PRIVATE_KEY || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant-time comparison that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHmac("sha256", "compare").update(a).digest();
  const hashB = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/** Returns null when no secret is configured, which disables the feature. */
export function issueRowToken(rowNumber: number): string | null {
  const secret = key();
  if (!secret || !Number.isInteger(rowNumber) || rowNumber < 2) return null;

  const payload = `${rowNumber}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the row number, or null if the token is forged, stale or malformed. */
export function verifyRowToken(token: unknown): number | null {
  const secret = key();
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [row, expiry, signature] = parts;
  if (!safeEqual(signature, sign(`${row}.${expiry}`, secret))) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const rowNumber = Number(row);
  // Row 1 is the header. Anything below 2 is a bug or an attempt.
  if (!Number.isInteger(rowNumber) || rowNumber < 2) return null;

  return rowNumber;
}
