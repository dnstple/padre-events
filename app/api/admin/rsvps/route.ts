import { NextResponse } from "next/server";

import { eventConfig } from "@/config/event";
import { getAdminSession } from "@/lib/admin-auth";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { RsvpRow, RsvpTotals } from "@/lib/rsvp-types";
import { summarise } from "@/lib/rsvp-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Authenticated guest-list endpoint. Polled by the dashboard every 10s.
 *
 * Authorisation is re-checked here on every single request — the dashboard
 * being rendered once does not grant ongoing access.
 */

const privateHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

export async function GET() {
  const auth = await getAdminSession();

  if (!auth.ok) {
    const status = auth.reason === "unauthenticated" ? 401 : 403;
    const message =
      auth.reason === "unconfigured"
        ? "Administrator access is not configured."
        : auth.reason === "unauthenticated"
          ? "Please sign in."
          : "This account is not authorised.";
    return NextResponse.json({ ok: false, message }, { status, headers: privateHeaders });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503, headers: privateHeaders },
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("event_rsvps")
    .select("id, first_name, last_name, rsvp_status, additional_guests, party_size, created_at")
    .eq("event_slug", eventConfig.slug)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[admin/rsvps] query failed:", error.code, error.message);
    return NextResponse.json(
      { ok: false, message: "We could not load the guest list." },
      { status: 500, headers: privateHeaders },
    );
  }

  const rows = (data ?? []) as RsvpRow[];
  const totals: RsvpTotals = summarise(rows);

  return NextResponse.json(
    { ok: true, rows, totals, fetchedAt: new Date().toISOString() },
    { status: 200, headers: privateHeaders },
  );
}
