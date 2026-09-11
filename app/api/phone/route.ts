import { NextResponse } from "next/server";

import { nameError, normaliseName } from "@/lib/name-rules";
import { normalisePhone, phoneError } from "@/lib/phone-rules";
import { verifyRowToken } from "@/lib/row-token";
import { appendMobile, isSheetsConfigured } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mobile capture, the sibling of /api/newsletter.
 *
 * The popup page asks how to reach you before it asks who you are, and mobile
 * is the first option — so a number is the most likely thing a visitor gives.
 * It is written to its own tab rather than a column of the RSVP sheet: it is a
 * different kind of record, from a different page, and the admin dashboard
 * that reads the RSVP tab should not have to change shape for it.
 *
 * Like the newsletter endpoint, it requires the signed row token issued with
 * the visitor's own RSVP. That means this cannot be used as an open write
 * endpoint: you have to have submitted a response in the last half hour.
 *
 * Request bodies are never logged — this one contains a phone number.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function problem(status: number, message: string, field?: "phone" | "name") {
  return NextResponse.json(
    { ok: false, message, errors: field ? { [field]: message } : {} },
    { status, headers: jsonHeaders },
  );
}

/** Keeps an unexpected value from becoming a sheet cell. */
function sourceLabel(value: unknown): string {
  const raw = String(value ?? "popup").trim().toLowerCase();
  return /^[a-z0-9 _-]{1,32}$/.test(raw) ? raw : "popup";
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

  // Honeypot, matching both other forms. Accept silently so bots learn nothing.
  if (typeof payload.company === "string" && payload.company.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
  }

  const rowNumber = verifyRowToken(payload.token);
  if (rowNumber === null) {
    return problem(403, "That link has expired. Please submit your RSVP again.");
  }

  const phoneMessage = phoneError(payload.phone);
  if (phoneMessage) return problem(422, phoneMessage, "phone");

  // The name is optional here — the RSVP row already has it — but if one is
  // sent it has to pass the same rules, so the tab cannot be seeded with a
  // formula or a chunk of markup.
  let name = "";
  if (payload.name !== undefined && payload.name !== null && payload.name !== "") {
    const nameMessage = nameError(payload.name);
    if (nameMessage) return problem(422, nameMessage, "name");
    name = normaliseName(String(payload.name));
  }

  if (!isSheetsConfigured()) {
    return problem(503, "Sign-ups are not available right now.");
  }

  try {
    await appendMobile({
      name,
      phone: normalisePhone(payload.phone),
      source: sourceLabel(payload.source),
      rsvpRow: rowNumber,
    });
  } catch (error) {
    console.error(
      "[phone] append failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return problem(500, "We could not save that. Please try again.");
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
