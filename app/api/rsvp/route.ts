import { NextResponse } from "next/server";

import { eventConfig } from "@/config/event";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
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
 * Deliberately narrow: it accepts one submission and returns only what the
 * confirmation screen needs to render. It never reads existing rows, never
 * returns counts, and never exposes another guest's data.
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

  if (!isSupabaseConfigured()) {
    return problem(503, "RSVPs are not available right now. Please try again shortly.");
  }

  // ---- 5. Insert -----------------------------------------------------------
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("event_rsvps")
    .insert({
      event_slug: eventConfig.slug,
      first_name: submission.first_name,
      last_name: submission.last_name,
      rsvp_status: submission.rsvp_status,
      additional_guests: additionalGuests,
      party_size: partySize,
    })
    // Return ONLY this submission's own fields. Nothing aggregate, no ids of
    // other rows, no counts.
    .select("first_name, last_name, rsvp_status, additional_guests, party_size")
    .single();

  if (error || !data) {
    // Log the database error, never the body.
    console.error("[rsvp] insert failed:", error?.code ?? "unknown", error?.message ?? "");
    return problem(500, "We could not save your response. Please try again.");
  }

  return NextResponse.json({ ok: true, rsvp: data }, { status: 201, headers: jsonHeaders });
}

/** Everything other than POST is closed. */
export async function GET() {
  return problem(405, "Method not allowed.");
}
