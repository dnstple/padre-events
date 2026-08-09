import { eventConfig } from "@/config/event";

/**
 * The RSVP field rules, with no dependencies.
 *
 * This module is the single source of truth for what a valid name is and what
 * the guest is told when it isn't. The browser imports it directly (so the
 * Next button can be honest) and the server's Zod schema is built on top of it
 * (see lib/validation.ts), which keeps the messages identical without shipping
 * Zod to the client — it is roughly 70 KB over the wire, on a page most people
 * will open on mobile data.
 */

export type RsvpStatus = "attending" | "declined";

export type Guest = {
  first_name: string;
  last_name: string;
};

export const MAX_NAME_LENGTH = 80;
export const MAX_ADDITIONAL_GUESTS = eventConfig.maxAdditionalGuests;

/** Characters that would let a name smuggle markup or a formula somewhere. */
const FORBIDDEN = /[<>{}\\`$|]/;
const HTML_TAG = /<[^>]*>/;
const HTML_ENTITY = /&#?\w+;/;

/**
 * A leading =, +, @ or - turns a cell into a formula in Google Sheets, Excel
 * and Numbers. Responses are written straight into a spreadsheet the organisers
 * open, so these are rejected at the door rather than escaped downstream — that
 * way nothing dangerous is ever stored, in the sheet or the CSV or the DOM.
 * No real first or last name begins with one of these.
 */
const FORMULA_LEAD = /^[=+@\-]/;

/** Collapses whitespace and trims. Always apply before validating or storing. */
export function normaliseName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Returns an error message, or null when the name is acceptable. */
export function nameError(value: unknown): string | null {
  if (typeof value !== "string") return "Required";

  const name = normaliseName(value);

  if (name.length < 1) return "Required";
  if (name.length > MAX_NAME_LENGTH) {
    return `Must be ${MAX_NAME_LENGTH} characters or fewer`;
  }
  if (FORBIDDEN.test(name) || HTML_TAG.test(name) || HTML_ENTITY.test(name)) {
    return "Please use letters only";
  }
  if (FORMULA_LEAD.test(name)) {
    return "Please start with a letter";
  }

  return null;
}

/** Server-authoritative party size. Never read this from a request body. */
export function calculatePartySize(
  status: RsvpStatus,
  additionalGuests: readonly Guest[],
): number {
  if (status === "declined") return 0;
  return 1 + additionalGuests.length;
}
