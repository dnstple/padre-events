import { NextResponse } from "next/server";

import { emailError, normaliseEmail } from "@/lib/email-rules";
import {
  appendKiezRsvp,
  isKiezSheetConfigured,
  readKiezExisting,
  type KiezExisting,
} from "@/lib/kiez-sheets";
import {
  cleanCampaign,
  cleanReferrer,
  cleanRequestId,
  jsonHeaders,
  problem,
  rateLimited,
  readJsonBody,
} from "@/lib/kiez-request";
import { nameError, normaliseName } from "@/lib/name-rules";
import { normalisePhone, phoneError } from "@/lib/phone-rules";
import { issueRowToken } from "@/lib/row-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RSVPs for Padre65 × Kiez, 17 October 2026.
 *
 * The pop-up's shape — a name and one contact detail — written to the pop-up
 * spreadsheet's own "Kiez RSVPs" tab, with the event identifier on every row.
 *
 * Duplicates. A double tap, a retry after a dropped connection and a second
 * visit with the same email must not become three rows. So:
 *   1. the page sends a request ID that stays the same across retries of one
 *      submission, and the same contact detail is a match too;
 *   2. an in-flight map joins concurrent requests on one instance;
 *   3. the sheet is read before writing, so a retry that reaches a different
 *      instance still finds the first row.
 * A match answers exactly as a fresh RSVP does — same "you're in", same
 * calendar token for the existing row — so the response never reveals
 * whether a given address was already on the list.
 */

type Result = { rowNumber: number | null };

const inflight = new Map<string, Promise<Result>>();

function matchExisting(
  rows: KiezExisting[],
  requestId: string,
  email: string,
  phone: string,
): KiezExisting | undefined {
  const tail = phone.replace(/\D/g, "").slice(-9);
  return rows.find(
    (row) =>
      (requestId !== "" && row.requestId === requestId) ||
      (email !== "" && row.email === email.toLowerCase()) ||
      (tail.length === 9 && row.phoneDigits.slice(-9) === tail),
  );
}

export async function POST(request: Request) {
  const read = await readJsonBody(request);
  if ("error" in read) return read.error;
  const payload = read.payload;

  if (rateLimited(request, "kiez-rsvp")) {
    return problem(429, "Too many attempts. Please wait a few minutes and try again.");
  }

  // Honeypot — see /api/popup for why a trip is logged loudly.
  if (typeof payload.website === "string" && payload.website.length > 0) {
    console.warn(
      "[kiez] honeypot tripped — RSVP discarded. If this is a real person, " +
        "the trap is being autofilled and must be changed.",
    );
    return NextResponse.json({ ok: true, token: null }, { status: 200, headers: jsonHeaders });
  }

  const nameMessage = nameError(payload.name);
  if (nameMessage) return problem(422, nameMessage, { name: nameMessage });

  const method = payload.method === "email" ? "email" : payload.method === "mobile" ? "mobile" : null;
  if (!method) return problem(422, "Please choose email or mobile.");

  let email = "";
  let phone = "";
  if (method === "email") {
    const message = emailError(payload.email);
    if (message) return problem(422, message, { contact: message });
    email = normaliseEmail(payload.email as string);
  } else {
    const message = phoneError(payload.phone);
    if (message) return problem(422, message, { contact: message });
    phone = normalisePhone(payload.phone);
  }

  if (!isKiezSheetConfigured()) {
    return problem(503, "RSVPs are not available right now.");
  }

  const test = payload.test === true;
  const requestId = cleanRequestId(payload.requestId);
  const contactKey = `${test ? "t" : "l"}:${email.toLowerCase() || phone.replace(/\D/g, "").slice(-9)}`;
  const keys = [contactKey, requestId ? `r:${requestId}` : ""].filter(Boolean);

  const joined = keys.map((k) => inflight.get(k)).find(Boolean);

  const work =
    joined ??
    (async (): Promise<Result> => {
      const existing = await readKiezExisting(test);
      const match = matchExisting(existing, requestId, email, phone);
      if (match) return { rowNumber: match.rowNumber };

      return appendKiezRsvp({
        name: normaliseName(String(payload.name)),
        method,
        email,
        phone,
        referrer: cleanReferrer(payload.referrer),
        campaign: cleanCampaign(payload.utm),
        requestId,
        test,
      });
    })();

  if (!joined) {
    keys.forEach((k) => inflight.set(k, work));
    work.finally(() => keys.forEach((k) => inflight.delete(k))).catch(() => {});
  }

  let result: Result;
  try {
    result = await work;
  } catch (error) {
    console.error("[kiez] save failed:", error instanceof Error ? error.message : "unknown");
    return problem(500, "We could not save that. Please try again.");
  }

  const token =
    result.rowNumber === null ? null : issueRowToken(result.rowNumber, test ? "kiez-test" : "kiez");

  return NextResponse.json({ ok: true, token }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
