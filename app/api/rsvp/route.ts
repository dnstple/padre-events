import { NextResponse } from "next/server";

import { eventConfig } from "@/config/event";
import { issueRowToken } from "@/lib/row-token";
import { appendRsvp, isSheetsConfigured } from "@/lib/sheets";
import {
  MAX_BODY_BYTES,
  calculatePartySize,
  fieldErrors,
  rsvpSubmissionSchema,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public RSVP endpoint.
 *
 * Deliberately narrow: it accepts one submission, appends a row to the sheet,
 * and returns only what the confirmation screen needs. It never reads the sheet
 * back, so it cannot leak another guest's response or a running total.
 *
 * Request bodies are never logged.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function problem(status: number, message: string, errors?: Record<string, string>) {
  return NextResponse.json({ ok: false, message, errors: errors ?? {} }, {
    status,
    headers: jsonHeaders,
  });
}

export async function POST(request: Request) {
  // ---- 1. Reject anything that is not a modest JSON body ------------------
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

  // Guard against a lying or absent Content-Length.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return problem(413, "That request was too large.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return problem(400, "We could not read that request.");
  }

  // ---- 2. Validate. This, not the browser, is the source of truth. --------
  const result = rsvpSubmissionSchema.safeParse(parsedJson);
  if (!result.success) {
    return problem(422, "Please check the highlighted fields.", fieldErrors(result.error));
  }

  const submission = result.data;

  // ---- 3. Honeypot. Accept silently so bots learn nothing. ----------------
  if (submission.company) {
    return NextResponse.json(
      {
        ok: true,
        rsvp: {
          first_name: submission.first_name,
          last_name: submission.last_name,
          rsvp_status: submission.rsvp_status,
          additional_guests: [],
          party_size: submission.rsvp_status === "attending" ? 1 : 0,
        },
        // No row was written, so there is nothing to attach an address to.
        emailToken: null,
      },
      { status: 201, headers: jsonHeaders },
    );
  }

  // ---- 4. Server-authoritative party size ---------------------------------
  const additionalGuests =
    submission.rsvp_status === "attending" ? submission.additional_guests : [];

  if (additionalGuests.length > eventConfig.maxAdditionalGuests) {
    return problem(422, "Please check the highlighted fields.", {
      additional_guests: `A maximum of ${eventConfig.maxAdditionalGuests} additional guests`,
    });
  }

  const partySize = calculatePartySize(submission.rsvp_status, additionalGuests);

  if (!isSheetsConfigured()) {
    return problem(503, "RSVPs are not available right now. Please try again shortly.");
  }

  // ---- 5. Append -----------------------------------------------------------
  const rsvp = {
    first_name: submission.first_name,
    last_name: submission.last_name,
    rsvp_status: submission.rsvp_status,
    additional_guests: additionalGuests,
    party_size: partySize,
  };

  let rowNumber: number | null = null;
  try {
    ({ rowNumber } = await appendRsvp(rsvp));
  } catch (error) {
    // Log the failure, never the body.
    console.error("[rsvp] append failed:", error instanceof Error ? error.message : "unknown");
    return problem(500, "We could not save your response. Please try again.");
  }

  // Lets the confirmation screen add an email address to this row, and nothing
  // else. Absent if the row could not be identified, which hides the newsletter
  // form rather than offering something that cannot work.
  const emailToken = rowNumber === null ? null : issueRowToken(rowNumber);

  return NextResponse.json(
    { ok: true, rsvp, emailToken },
    { status: 201, headers: jsonHeaders },
  );
}

/** Everything other than POST is closed. */
export async function GET() {
  return problem(405, "Method not allowed.");
}
