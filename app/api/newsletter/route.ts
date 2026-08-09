import { NextResponse } from "next/server";

import { emailError, normaliseEmail } from "@/lib/email-rules";
import { verifyRowToken } from "@/lib/row-token";
import { attachNewsletterOptIn, isSheetsConfigured } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional newsletter opt-in, offered after a response has been recorded.
 *
 * Writes an email address into columns M and N of the row the guest's own RSVP
 * created. The row number arrives inside a signed token issued with that RSVP,
 * so this endpoint cannot be aimed at an arbitrary row, and it cannot be used
 * at all without having submitted a response in the last half hour.
 *
 * Consent is the act of submitting this form, which is labelled with what the
 * guest is signing up for. The timestamp written alongside the address is the
 * record of when that happened.
 *
 * Request bodies are never logged — this one contains an email address.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function problem(status: number, message: string, field?: string) {
  return NextResponse.json(
    { ok: false, message, errors: field ? { email: message } : {} },
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

  // Honeypot, matching the RSVP form. Accept silently so bots learn nothing.
  if (typeof payload.company === "string" && payload.company.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
  }

  const rowNumber = verifyRowToken(payload.token);
  if (rowNumber === null) {
    // Deliberately vague: this is either a forgery or a guest who left the tab
    // open for half an hour, and the second one only needs to know to redo it.
    return problem(403, "That link has expired. Please submit your RSVP again.");
  }

  const message = emailError(payload.email);
  if (message) return problem(422, message, "email");

  if (!isSheetsConfigured()) {
    return problem(503, "Sign-ups are not available right now.");
  }

  try {
    await attachNewsletterOptIn(rowNumber, normaliseEmail(payload.email as string));
  } catch (error) {
    console.error(
      "[newsletter] update failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return problem(500, "We could not save that. Please try again.");
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
