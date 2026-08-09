import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { eventConfig } from "@/config/event";
import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";
import { PrivateKeyFormatError, normalisePrivateKey } from "@/lib/private-key.mjs";
import { describeSheet, isSheetsConfigured, readRsvps } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * "Where are the responses actually going?"
 *
 * Reports which spreadsheet this deployment is writing to, what its tabs are
 * called, and how many rows are in it. Answers the one question that cannot be
 * answered from the outside: whether the sheet on your screen is the sheet the
 * server holds the ID for.
 *
 * Administrator session required — the sheet ID and service-account address are
 * not secrets on their own, but they are nobody else's business.
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
      {
        ok: false,
        message:
          "This deployment has no Google credentials. Check the environment variables in Vercel, then redeploy.",
      },
      { status: 503, headers: privateHeaders },
    );
  }

  // Check the key can be read before blaming Google for anything.
  try {
    normalisePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  } catch (error) {
    if (error instanceof PrivateKeyFormatError) {
      return NextResponse.json(
        {
          ok: false,
          problem: "private-key",
          message: error.message,
          hint: "Fix GOOGLE_PRIVATE_KEY in Vercel, then redeploy. Do not include surrounding quotes.",
        },
        { status: 503, headers: privateHeaders },
      );
    }
    throw error;
  }

  try {
    const sheet = await describeSheet();
    const rows = await readRsvps();

    return NextResponse.json(
      {
        ok: true,
        sheet,
        eventSlug: eventConfig.slug,
        // readRsvps() ignores rows belonging to a different event, so a gap
        // between these two numbers means rows exist under another slug.
        rowsForThisEvent: rows.length,
        mostRecent: rows[0]?.created_at ?? null,
        checkedAt: new Date().toISOString(),
      },
      { status: 200, headers: privateHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[admin/diagnostics] failed:", message);
    return NextResponse.json(
      {
        ok: false,
        // Safe to surface: this is a status code from Google, not a credential.
        message: `Could not reach the spreadsheet. ${message}`,
        hint: "403 means the sheet is not shared with the service account. 404 means GOOGLE_SHEET_ID is wrong.",
      },
      { status: 502, headers: privateHeaders },
    );
  }
}
