import { cookies } from "next/headers";

import { eventConfig } from "@/config/event";
import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { toCsv } from "@/lib/csv";
import { guestNames } from "@/lib/rsvp-types";
import { isSheetsConfigured, readRsvps } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const textHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

/**
 * Authenticated CSV export. Same gate as the dashboard, and the output is
 * escaped against spreadsheet formula injection in lib/csv.ts.
 */
export async function GET() {
  if (!isAdminConfigured()) {
    return new Response("Not authorised.", { status: 403, headers: textHeaders });
  }

  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    return new Response("Please sign in.", { status: 401, headers: textHeaders });
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
    ],
    ...rows.map((row) => [
      new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19),
      row.first_name,
      row.last_name,
      row.rsvp_status === "attending" ? "Attending" : "Declined",
      guestNames(row.additional_guests).join("; "),
      row.party_size,
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
