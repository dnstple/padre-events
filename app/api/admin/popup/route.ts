import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { summarisePopup, type PopupTotals } from "@/lib/popup-types";
import { isPopupSheetConfigured, readEggSolves, readPopupSignups } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Authenticated popup signups, polled by the dashboard.
 *
 * Same rules as /api/admin/rsvps: the session is re-verified on every single
 * request, and nothing is ever rendered into the page's initial HTML.
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

  if (!isPopupSheetConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The popup spreadsheet is not configured. Set GOOGLE_POPUP_SHEET_ID in Vercel, then redeploy.",
      },
      { status: 503, headers: privateHeaders },
    );
  }

  try {
    const egg = await readEggSolves();
    const rows = await readPopupSignups(new Set(egg.signupRows));
    const totals: PopupTotals = summarisePopup(rows, egg.total);
    return NextResponse.json(
      { ok: true, rows, totals, fetchedAt: new Date().toISOString() },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    console.error("[admin/popup] read failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { ok: false, message: "We could not load the signups." },
      { status: 500, headers: privateHeaders },
    );
  }
}
