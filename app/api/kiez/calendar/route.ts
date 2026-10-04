import { NextResponse } from "next/server";

import { markKiezCalendarAdded, isKiezSheetConfigured } from "@/lib/kiez-sheets";
import { jsonHeaders, problem, readJsonBody } from "@/lib/kiez-request";
import { verifyRowToken } from "@/lib/row-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notes on the guest's own row that they took the calendar file. The row is
 * named only by the signed token /api/kiez handed back, so nobody can mark
 * somebody else's. A failed note is not the guest's problem: the file is
 * already downloading, so this answers ok either way.
 */
export async function POST(request: Request) {
  const read = await readJsonBody(request);
  if ("error" in read) return read.error;

  const token = read.payload.token;
  let test = false;
  let rowNumber = verifyRowToken(token, "kiez");
  if (rowNumber === null) {
    rowNumber = verifyRowToken(token, "kiez-test");
    test = rowNumber !== null;
  }
  if (rowNumber === null) return problem(403, "That link has expired.");

  if (!isKiezSheetConfigured()) return problem(503, "Not available right now.");

  try {
    await markKiezCalendarAdded(rowNumber, test);
  } catch (error) {
    console.error("[kiez/calendar] update failed:", error instanceof Error ? error.message : "unknown");
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
