import { cookies } from "next/headers";

import { eventConfig } from "@/config/event";
import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { toCsv } from "@/lib/csv";
import { guestNames } from "@/lib/rsvp-types";
import {
  isPopupSheetConfigured,
  isSheetsConfigured,
  readEggSolves,
  readPopupSignups,
  readRsvps,
} from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const textHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

/**
 * Authenticated CSV export for either event. Same gate as the dashboard, and
 * the output is escaped against spreadsheet formula injection in lib/csv.ts.
 *
 * `?event=popup` exports the popup signups; anything else exports the
 * house-party guest list, so existing links keep working.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) {
    return new Response("Not authorised.", { status: 403, headers: textHeaders });
  }

  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    return new Response("Please sign in.", { status: 401, headers: textHeaders });
  }

  const wantsPopup = new URL(request.url).searchParams.get("event") === "popup";

  if (wantsPopup) {
    if (!isPopupSheetConfigured()) {
      return new Response("The popup spreadsheet is not configured.", {
        status: 503,
        headers: textHeaders,
      });
    }

    let signups;
    try {
      const egg = await readEggSolves();
      signups = await readPopupSignups(new Set(egg.signupRows));
    } catch (error) {
      console.error(
        "[admin/export] popup read failed:",
        error instanceof Error ? error.message : "unknown",
      );
      return new Response("Export failed.", { status: 500, headers: textHeaders });
    }

    const popupCsv = toCsv([
      ["Submitted at (UTC)", "Name", "Email", "Phone", "Added to calendar", "Easter egg"],
      ...signups.map((row) => [
        row.created_at ? row.created_at.replace("T", " ").replace("Z", "") : "",
        row.name,
        row.email,
        row.phone,
        row.calendar,
        row.egg ? "Solved" : "",
      ]),
    ]);

    const popupStamp = new Date().toISOString().slice(0, 10);

    return new Response(popupCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="popup-signups-${popupStamp}.csv"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!isSheetsConfigured()) {
    return new Response("The guest list sheet is not configured.", {
      status: 503,
      headers: textHeaders,
    });
  }

  let rows;
  try {
    rows = await readRsvps();
  } catch (error) {
    console.error("[admin/export] read failed:", error instanceof Error ? error.message : "unknown");
    return new Response("Export failed.", { status: 500, headers: textHeaders });
  }

  const csv = toCsv([
    [
      "Submitted at (UTC)",
      "First name",
      "Last name",
      "RSVP status",
      "Additional guests",
      "Party size",
      // Present only for guests who opted into the newsletter afterwards.
      // These two columns are what you paste into Klaviyo.
      "Email",
      "Newsletter consent (UTC)",
    ],
    ...rows.map((row) => [
      new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19),
      row.first_name,
      row.last_name,
      row.rsvp_status === "attending" ? "Attending" : "Declined",
      guestNames(row.additional_guests).join("; "),
      row.party_size,
      row.email ?? "",
      row.newsletter_consent_at ?? "",
    ]),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${eventConfig.slug}-guest-list-${stamp}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
