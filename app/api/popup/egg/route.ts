import { NextResponse } from "next/server";

import { verifyRowToken } from "@/lib/row-token";
import { appendEggSolve, isPopupSheetConfigured } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records one completed easter egg.
 *
 * Unlike the calendar endpoint this does not require a token: the puzzle sits
 * on the page, not behind the form, so a count gated on signing up would not
 * answer the question being asked. A token is used when the visitor has one,
 * to tie the solve to their row.
 *
 * The consequence of being open is worth being clear about: this is a
 * tally, not an audited figure. It can be inflated by anyone willing to post
 * to it, and the page's own guard against double counting is per browser.
 * For a popup-shop prize that is the right trade; do not treat it as proof of
 * anything on its own.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { ok: false, message: "Unsupported content type." },
      { status: 415, headers: jsonHeaders },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: jsonHeaders });
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413, headers: jsonHeaders });
  }

  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: jsonHeaders });
  }

  const token = typeof body === "object" && body !== null
    ? (body as Record<string, unknown>).token
    : undefined;
  const signupRow = verifyRowToken(token, "popup");

  if (!isPopupSheetConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503, headers: jsonHeaders });
  }

  try {
    await appendEggSolve(signupRow);
  } catch (error) {
    console.error(
      "[popup/egg] append failed:",
      error instanceof Error ? error.message : "unknown",
    );
    // The visitor has already won; a failed tally is not their problem.
    return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Method not allowed." },
    { status: 405, headers: jsonHeaders },
  );
}
