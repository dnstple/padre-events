import { NextResponse } from "next/server";

import { verifyRowToken } from "@/lib/row-token";
import { isPopupSheetConfigured, markPopupCalendarAdded } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a model-search registration as having asked for the calendar file.
 *
 * The rows live in the same tab as the pop-up's, so this writes the same
 * column — but the token is scoped to "models", not "popup". Row numbers are
 * just integers, and without the scope a token issued here would verify
 * perfectly against the pop-up endpoint and vice versa.
 *
 * What this records is that the button was pressed. The browser gives no
 * confirmation that a download finished or that an event reached anybody's
 * calendar, and the column is worded accordingly.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function problem(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status, headers: jsonHeaders });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return problem(415, "Unsupported content type.");
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

  const rowNumber = verifyRowToken((body as Record<string, unknown>).token, "models");
  if (rowNumber === null) return problem(403, "That link has expired.");

  if (!isPopupSheetConfigured()) return problem(503, "Not available right now.");

  try {
    await markPopupCalendarAdded(rowNumber);
  } catch (error) {
    console.error(
      "[model-search/calendar] update failed:",
      error instanceof Error ? error.message : "unknown",
    );
    // Nothing the visitor can do about this, and their registration is
    // already safe, so the page is told everything is fine.
    return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
