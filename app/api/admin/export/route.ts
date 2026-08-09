import { eventConfig } from "@/config/event";
import { getAdminSession } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { guestNames, type RsvpRow } from "@/lib/rsvp-types";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Authenticated CSV export.
 *
 * Uses exactly the same authorisation gate as the dashboard data endpoint —
 * a valid Supabase session whose email is in ADMIN_EMAILS. Output is escaped
 * against spreadsheet formula injection in lib/csv.ts.
 */
export async function GET() {
  const auth = await getAdminSession();

  if (!auth.ok) {
    return new Response(
      auth.reason === "unauthenticated" ? "Please sign in." : "Not authorised.",
      {
        status: auth.reason === "unauthenticated" ? 401 : 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  if (!isSupabaseConfigured()) {
    return new Response("Supabase is not configured.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("event_rsvps")
    .select("first_name, last_name, rsvp_status, additional_guests, party_size, created_at")
    .eq("event_slug", eventConfig.slug)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) {
    console.error("[admin/export] query failed:", error.code, error.message);
    return new Response("Export failed.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const rows = (data ?? []) as RsvpRow[];

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
