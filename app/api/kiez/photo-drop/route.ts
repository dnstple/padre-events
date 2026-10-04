import { NextResponse } from "next/server";

import { emailError, normaliseEmail } from "@/lib/email-rules";
import { appendKiezPhotoDrop, isKiezSheetConfigured } from "@/lib/kiez-sheets";
import {
  cleanRequestId,
  jsonHeaders,
  problem,
  rateLimited,
  readJsonBody,
} from "@/lib/kiez-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Tell me when the Kiez photos are up." One email address on its own tab.
 *
 * This is a single-purpose request about one gallery — it is not an RSVP and
 * it is not newsletter consent, and nothing here sends anything. The list is
 * for the organiser to use once, when the photos are published.
 *
 * Asking twice answers the same as asking once.
 */
export async function POST(request: Request) {
  const read = await readJsonBody(request);
  if ("error" in read) return read.error;
  const payload = read.payload;

  if (rateLimited(request, "kiez-photo", 10)) {
    return problem(429, "Too many attempts. Please wait a few minutes and try again.");
  }

  if (typeof payload.website === "string" && payload.website.length > 0) {
    console.warn("[kiez/photo-drop] honeypot tripped — request discarded.");
    return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
  }

  const message = emailError(payload.email);
  if (message) return problem(422, message, { email: message });

  if (!isKiezSheetConfigured()) return problem(503, "This is not available right now.");

  try {
    await appendKiezPhotoDrop(
      normaliseEmail(payload.email as string),
      cleanRequestId(payload.requestId),
      payload.test === true,
    );
  } catch (error) {
    console.error("[kiez/photo-drop] save failed:", error instanceof Error ? error.message : "unknown");
    return problem(500, "We could not save that. Please try again.");
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
