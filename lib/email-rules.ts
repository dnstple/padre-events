/**
 * Email validation, with no dependencies, for the same reason as
 * lib/name-rules.ts: the browser and the server must agree on what is
 * acceptable, and Zod must not end up in the client bundle.
 *
 * The rule is deliberately permissive. This address is going into a newsletter
 * list, so the only failure that matters is a typo the guest can still fix
 * while they are looking at the form. Rejecting a valid but unusual address is
 * a worse outcome than accepting one that later bounces, and no regex agrees
 * with RFC 5322 anyway.
 */

export const MAX_EMAIL_LENGTH = 254; // RFC 5321 limit on a forward path.

/** One @, something either side, a dot in the domain, no whitespace. */
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Characters that would let an address smuggle markup somewhere. */
const FORBIDDEN = /[<>{}\\`$|,;"']/;

/**
 * A leading =, +, @ or - makes a spreadsheet cell a formula. Addresses are
 * written straight into the sheet, so these are refused rather than escaped
 * later. `+` is the one real cost — plus-addressing is legitimate, but only in
 * the form name+tag@…, which still starts with a letter.
 */
const FORMULA_LEAD = /^[=+@\-]/;

export function normaliseEmail(value: string): string {
  return value.trim();
}

/** Returns an error message, or null when the address is acceptable. */
export function emailError(value: unknown): string | null {
  if (typeof value !== "string") return "Required";

  const email = normaliseEmail(value);

  if (email.length < 1) return "Required";
  if (email.length > MAX_EMAIL_LENGTH) {
    return `Must be ${MAX_EMAIL_LENGTH} characters or fewer`;
  }
  if (FORMULA_LEAD.test(email)) return "Please start with a letter or a number";
  if (FORBIDDEN.test(email)) return "Please enter a valid email address";
  if (!SHAPE.test(email)) return "Please enter a valid email address";

  return null;
}
