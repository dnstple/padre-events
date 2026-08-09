import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { summarise, type RsvpTotals } from "@/lib/rsvp-types";
import { isSheetsConfigured, readRsvps } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Authenticated guest list, polled by the dashboard.
 *
 * The session is re-verified on every single request. The dashboard having been
 * rendered once grants nothing.
 */

const privateHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

export async function GET() {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Administrator access is not configured." },
      { status: 403, headers: privateHeaders },
    );
  }

  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json(
      { ok: false, message: "Please sign in." },
      { status: 401, headers: privateHeaders },
    );
  }

  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { ok: false, message: "The guest list sheet is not configured." },
      { status: 503, headers: privateHeaders },
    );
  }

  try {
    const rows = await readRsvps();
    const totals: RsvpTotals = summarise(rows);
    return NextResponse.json(
      { ok: true, rows, totals, fetchedAt: new Date().toISOString() },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    console.error("[admin/rsvps] read failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { ok: false, message: "We could not load the guest list." },
      { status: 500, headers: privateHeaders },
    );
  }
}
