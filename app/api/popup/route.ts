import { NextResponse } from "next/server";

import { emailError, normaliseEmail } from "@/lib/email-rules";
import { nameError, normaliseName } from "@/lib/name-rules";
import { normalisePhone, phoneError } from "@/lib/phone-rules";
import { issueRowToken } from "@/lib/row-token";
import { appendPopupSignup, isPopupSheetConfigured } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signups from the popup page at /popup.
 *
 * One row per person in a spreadsheet of its own: name, one contact detail,
 * and later a note of whether they took the calendar file. The house-party
 * RSVP sheet is a different shape — party size, guests, attending/declined —
 * and none of it applies here, so this does not touch it.
 *
 * Responds with a short-lived signed token scoped to the row it created. The
 * calendar endpoint needs it, and it is the only way to write that row, so a
 * visitor cannot aim an update at somebody else's.
 *
 * Request bodies are never logged — they carry a phone number or an email.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function problem(status: number, message: string, field?: "name" | "email" | "phone") {
  return NextResponse.json(
    { ok: false, message, errors: field ? { [field]: message } : {} },
    { status, headers: jsonHeaders },
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return problem(415, "Unsupported content type.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return problem(413, "That request was too large.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return problem(400, "We could not read that request.");
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return problem(413, "That request was too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, "We could not read that request.");
  }

  if (typeof body !== "object" || body === null) {
    return problem(400, "We could not read that request.");
  }

  const payload = body as Record<string, unknown>;

  // Honeypot. Accept silently so bots learn nothing from the response — but
  // never silently to US. A trip throws a signup away while telling the
  // visitor it worked, and the page's trap was a clipped field called
  // "company" until 19 September, which password managers fill. If this
  // appears in the logs, the trap is eating real people.
  if (typeof payload.company === "string" && payload.company.length > 0) {
    console.warn(
      "[popup] honeypot tripped — signup discarded. If this is a real person, " +
      "the trap is being autofilled and must be changed.",
    );
    return NextResponse.json({ ok: true, token: null }, { status: 200, headers: jsonHeaders });
  }

  const nameMessage = nameError(payload.name);
  if (nameMessage) return problem(422, nameMessage, "name");

  // Exactly one contact detail. The page asks for one or the other, so two is
  // a malformed request rather than a generous visitor.
  const hasEmail = typeof payload.email === "string" && payload.email.trim() !== "";
  const hasPhone = typeof payload.phone === "string" && payload.phone.trim() !== "";

  if (!hasEmail && !hasPhone) {
    return problem(422, "Please give us a mobile number or an email address.");
  }
  if (hasEmail && hasPhone) {
    return problem(422, "Please give us one or the other, not both.");
  }

  let email = "";
  let phone = "";

  if (hasEmail) {
    const message = emailError(payload.email);
    if (message) return problem(422, message, "email");
    email = normaliseEmail(payload.email as string);
  } else {
    const message = phoneError(payload.phone);
    if (message) return problem(422, message, "phone");
    phone = normalisePhone(payload.phone);
  }

  if (!isPopupSheetConfigured()) {
    return problem(503, "Sign-ups are not available right now.");
  }

  let rowNumber: number | null = null;
  try {
    ({ rowNumber } = await appendPopupSignup({
      name: normaliseName(String(payload.name)),
      email,
      phone,
    }));
  } catch (error) {
    console.error(
      "[popup] append failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return problem(500, "We could not save that. Please try again.");
  }

  // No row number means the append succeeded but Sheets described the result
  // in a shape we did not expect. The signup is safe; only the calendar flag
  // is lost, so this degrades rather than failing the visitor.
  const token = rowNumber === null ? null : issueRowToken(rowNumber, "popup");

  return NextResponse.json({ ok: true, token }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
