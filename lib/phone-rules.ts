/**
 * Mobile-number rules, shared by the browser and the server.
 *
 * Dependency-free on purpose, exactly like lib/name-rules.ts: the popup page
 * applies the same checks in the browser, and shipping Zod to the client to
 * say "that number looks too short" would cost more than the feature.
 *
 * Deliberately permissive. The job is to catch a typo, not to police format:
 * people write UK numbers as 07700 900123, +44 7700 900123, (07700) 900123,
 * and all of those are the same number. Anything with a plausible count of
 * digits is accepted and stored as the guest typed it.
 */

/** E.164 allows at most 15 digits; the shortest national numbers run to 9. */
const MIN_DIGITS = 9;
const MAX_DIGITS = 15;

/** Everything a person might reasonably type in a phone field. */
const ALLOWED = /^[0-9+()\-.\s]+$/;

export const MAX_PHONE_LENGTH = 24;

/** Collapses runs of whitespace; keeps the guest's own grouping otherwise. */
export function normalisePhone(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Just the digits, for counting and for de-duplication. */
export function phoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Returns a message to show the guest, or null when the number is fine. */
export function phoneError(value: unknown): string | null {
  const raw = normalisePhone(value);
  if (!raw) return "Required";
  if (raw.length > MAX_PHONE_LENGTH) return "That number looks too long";
  if (!ALLOWED.test(raw)) return "Numbers only, please";

  const digits = phoneDigits(raw);
  if (digits.length < MIN_DIGITS) return "That number looks too short";
  if (digits.length > MAX_DIGITS) return "That number looks too long";
  return null;
}
