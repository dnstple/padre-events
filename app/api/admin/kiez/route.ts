import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { countKiezPhotoDrop, readKiezRsvps } from "@/lib/kiez-sheets";
import { isPopupSheetConfigured } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The Kiez guest list, for the admin dashboard. Test-tab rows are never read. */

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
    return NextResponse.json({ ok: false, message: "Please sign in." }, { status: 401, headers: privateHeaders });
  }

  if (!isPopupSheetConfigured()) {
    return NextResponse.json(
      { ok: false, message: "GOOGLE_POPUP_SHEET_ID is not set on this deployment." },
      { status: 503, headers: privateHeaders },
    );
  }

  try {
    const [rows, photoDrop] = await Promise.all([readKiezRsvps(), countKiezPhotoDrop()]);
    const totals = {
      rsvps: rows.length,
      withMobile: rows.filter((r) => r.phone).length,
      withEmail: rows.filter((r) => r.email).length,
      addedToCalendar: rows.filter((r) => r.calendar).length,
      photoDrop,
    };
    return NextResponse.json(
      { ok: true, rows, totals, fetchedAt: new Date().toISOString() },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    console.error("[admin/kiez] read failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { ok: false, message: "We could not load the RSVPs." },
      { status: 500, headers: privateHeaders },
    );
  }
}
