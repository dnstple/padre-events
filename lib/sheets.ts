import "server-only";

import { createSign } from "node:crypto";

import { eventConfig } from "@/config/event";
import type { Guest, RsvpStatus } from "@/lib/name-rules";
import type { RsvpRow } from "@/lib/rsvp-types";

/**
 * Google Sheets storage.
 *
 * SERVER ONLY — the `server-only` import makes the build fail if this is ever
 * pulled into a client component, so the service-account key cannot reach the
 * browser.
 *
 * Deliberately no SDK. `googleapis` is an enormous package for what this needs:
 * sign a JWT, swap it for an access token, and call two REST endpoints. That is
 * about eighty lines with Node's built-in crypto, and it keeps cold starts fast.
 *
 * The sheet is the database. Guard it like one: share it with the service
 * account and with people you trust, and never publish it to the web.
 */

/**
 * Endpoints. Both are overridable so the test suite can point the real code
 * path at a local stub — nothing else should ever set these.
 */
const SHEETS_API =
  process.env.GOOGLE_SHEETS_API_URL ?? "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Worksheet (tab) name inside the spreadsheet. */
export const SHEET_TAB = process.env.GOOGLE_SHEET_TAB ?? "RSVPs";

/**
 * Column order. Guests get their own columns rather than one packed cell, so
 * the sheet stays readable and no separator can be confused with a name.
 */
export const HEADER_ROW = [
  "Submitted at (UTC)",
  "Event",
  "First name",
  "Last name",
  "Status",
  "Party size",
  "Guest 1 first",
  "Guest 1 last",
  "Guest 2 first",
  "Guest 2 last",
  "Guest 3 first",
  "Guest 3 last",
] as const;

export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_SHEET_ID,
  );
}

/* -----------------------------------------------------------------------------
 * Access token
 * -------------------------------------------------------------------------- */

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  // Google tokens last an hour; reuse until a minute before expiry.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Env vars cannot hold real newlines, so the key is stored with literal \n.
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) throw new Error("Google service account is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signature = base64url(
    createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key),
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) {
    // Never log the assertion or the key — only the status.
    throw new Error(`Google token request failed (${response.status})`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  return fetch(`${SHEETS_API}/${sheetId}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

/* -----------------------------------------------------------------------------
 * Writes
 * -------------------------------------------------------------------------- */

export type NewRsvp = {
  first_name: string;
  last_name: string;
  rsvp_status: RsvpStatus;
  additional_guests: Guest[];
  party_size: number;
};

/**
 * Appends one response.
 *
 * `valueInputOption: RAW` stores every cell as literal text rather than parsing
 * it the way the Sheets UI would. Names that could act as formulas are already
 * rejected by lib/name-rules.ts; this is the second layer.
 */
export async function appendRsvp(rsvp: NewRsvp): Promise<void> {
  const g = rsvp.additional_guests;
  const row = [
    new Date().toISOString().replace("T", " ").slice(0, 19),
    eventConfig.slug,
    rsvp.first_name,
    rsvp.last_name,
    rsvp.rsvp_status,
    String(rsvp.party_size),
    g[0]?.first_name ?? "",
    g[0]?.last_name ?? "",
    g[1]?.first_name ?? "",
    g[1]?.last_name ?? "",
    g[2]?.first_name ?? "",
    g[2]?.last_name ?? "",
  ];

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(SHEET_TAB)}!A:L:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );

  if (!response.ok) {
    throw new Error(`Sheets append failed (${response.status})`);
  }
}

/* -----------------------------------------------------------------------------
 * Reads
 * -------------------------------------------------------------------------- */

/** Reads every response for the configured event, newest first. */
export async function readRsvps(): Promise<RsvpRow[]> {
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(SHEET_TAB)}!A2:L?majorDimension=ROWS`,
  );

  if (!response.ok) {
    throw new Error(`Sheets read failed (${response.status})`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values ?? [];

  const parsed: RsvpRow[] = [];

  rows.forEach((cells, index) => {
    const [
      submittedAt = "",
      slug = "",
      firstName = "",
      lastName = "",
      status = "",
      partySize = "",
      g1f = "",
      g1l = "",
      g2f = "",
      g2l = "",
      g3f = "",
      g3l = "",
    ] = cells;

    // Skip blank rows and anything belonging to a different event.
    if (!firstName && !lastName) return;
    if (slug && slug !== eventConfig.slug) return;

    const guests: Guest[] = [
      { first_name: g1f, last_name: g1l },
      { first_name: g2f, last_name: g2l },
      { first_name: g3f, last_name: g3l },
    ].filter((guest) => guest.first_name || guest.last_name);

    const rsvpStatus: RsvpStatus = status === "attending" ? "attending" : "declined";

    parsed.push({
      // The sheet has no primary key; the row position is stable enough for a
      // React key and is never shown to anyone.
      id: `row-${index + 2}`,
      first_name: firstName,
      last_name: lastName,
      rsvp_status: rsvpStatus,
      additional_guests: rsvpStatus === "attending" ? guests : [],
      party_size: Number(partySize) || 0,
      created_at: submittedAt ? `${submittedAt.replace(" ", "T")}Z` : new Date(0).toISOString(),
    });
  });

  return parsed.reverse(); // newest first
}
