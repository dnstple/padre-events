import "server-only";

import { createSign } from "node:crypto";

import { eventConfig } from "@/config/event";
import type { Guest, RsvpStatus } from "@/lib/name-rules";
import { normalisePrivateKey } from "@/lib/private-key.mjs";
import type { PopupRow } from "@/lib/popup-types";
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
  // Optional, added after the response is written if the guest opts in.
  "Email",
  "Newsletter consent (UTC)",
] as const;

/** Columns A–N. Guest data ends at L; the newsletter opt-in occupies M and N. */
const FIRST_COLUMN = "A";
const LAST_COLUMN = "N";

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
  if (!email) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.");

  // Rebuilt from whatever survived the copy-paste. Throws a message that names
  // the actual problem instead of OpenSSL's "DECODER routines::unsupported".
  const key = normalisePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

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

  let signature: string;
  try {
    signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key));
  } catch {
    // The key parsed as a PEM but is not a usable signing key.
    throw new Error(
      "GOOGLE_PRIVATE_KEY is a well-formed PEM but could not sign. Generate a new service-account key.",
    );
  }

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

/**
 * One service account, two spreadsheets. `spreadsheetId` defaults to the
 * house-party sheet; the popup page has its own document because it captures
 * a different shape of data for a different event.
 */
async function sheetsFetch(
  path: string,
  init?: RequestInit,
  spreadsheetId?: string,
): Promise<Response> {
  const token = await getAccessToken();
  const sheetId = spreadsheetId ?? process.env.GOOGLE_SHEET_ID;
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
 * Appends one response and returns the row number it landed on, so the
 * newsletter opt-in can fill in columns M and N of that same row afterwards.
 *
 * `valueInputOption: RAW` stores every cell as literal text rather than parsing
 * it the way the Sheets UI would. Names that could act as formulas are already
 * rejected by lib/name-rules.ts; this is the second layer.
 */
export async function appendRsvp(rsvp: NewRsvp): Promise<{ rowNumber: number | null }> {
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
    `/values/${encodeURIComponent(SHEET_TAB)}!${FIRST_COLUMN}:${LAST_COLUMN}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );

  if (!response.ok) {
    throw new Error(`Sheets append failed (${response.status})`);
  }

  // Google reports where it put the row, e.g. "RSVPs!A7:N7". If that ever
  // changes shape the RSVP still succeeded — only the opt-in is lost, so this
  // degrades to null rather than throwing.
  const data = (await response.json().catch(() => null)) as
    | { updates?: { updatedRange?: string } }
    | null;

  const match = data?.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
  return { rowNumber: match ? Number(match[1]) : null };
}

/**
 * Writes the newsletter opt-in into columns M and N of a row that already
 * exists. Only ever called with a row number that arrived inside a signed
 * token, so a visitor cannot aim this at somebody else's response.
 */
export async function attachNewsletterOptIn(
  rowNumber: number,
  email: string,
): Promise<void> {
  const consentAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(SHEET_TAB)}!M${rowNumber}:N${rowNumber}` +
      `?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[email, consentAt]] }) },
  );

  if (!response.ok) {
    throw new Error(`Sheets newsletter update failed (${response.status})`);
  }
}

/* -----------------------------------------------------------------------------
 * Tab creation, shared by both spreadsheets
 * -------------------------------------------------------------------------- */

/**
 * Tabs this process has already confirmed exist. Sheets charges a metadata
 * request to find out, and the answer cannot become false while the server is
 * running — nobody deletes a tab mid-event — so it is worth remembering.
 */
const knownTabs = new Set<string>();

/**
 * Creates the tab and writes its header if it is not there yet.
 *
 * Doing this in code rather than asking the organiser to make the tab by hand
 * removes the failure everybody hits once: a 400 from Sheets that reads like a
 * credentials problem but is actually a missing worksheet.
 */
async function ensureTab(
  title: string,
  header: readonly string[],
  spreadsheetId?: string,
): Promise<void> {
  const cacheKey = `${spreadsheetId ?? "default"}/${title}`;
  if (knownTabs.has(cacheKey)) return;

  const metadata = await sheetsFetch("?fields=sheets.properties.title", undefined, spreadsheetId);
  if (!metadata.ok) throw new Error(`Sheets metadata failed (${metadata.status})`);

  const data = (await metadata.json()) as { sheets?: { properties?: { title?: string } }[] };
  const exists = (data.sheets ?? []).some((sheet) => sheet.properties?.title === title);

  if (!exists) {
    const created = await sheetsFetch(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    }, spreadsheetId);
    // A 400 here is very likely a race with another request that just made it.
    if (!created.ok && created.status !== 400) {
      throw new Error(`Sheets addSheet failed (${created.status})`);
    }

    const written = await sheetsFetch(
      `/values/${encodeURIComponent(title)}!A1?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: [header] }) },
      spreadsheetId,
    );
    if (!written.ok) throw new Error(`Sheets header write failed (${written.status})`);
  } else {
    await widenHeader(title, header, spreadsheetId);
  }

  knownTabs.add(cacheKey);
}

/** 1 → A, 9 → I. Only ever called with a single-letter column. */
function columnLetter(index: number): string {
  return String.fromCharCode(64 + index);
}

/**
 * Labels the columns a tab gained after it was created.
 *
 * `ensureTab` writes a header only when it makes the tab, so a tab that
 * already holds data keeps whatever header it was born with. The moment the
 * code starts writing more columns than the sheet has labels for — which is
 * exactly what the model-search fields do to a Signups tab that predates
 * them — the new values arrive under blank headings and nobody reading the
 * spreadsheet can tell what they are.
 *
 * Only the missing cells are written. Rewriting the whole row would be one
 * line shorter and would quietly undo any heading the organiser had renamed
 * by hand, which is their spreadsheet to rename.
 *
 * A header that cannot be read or written is not worth failing a signup
 * over: the row still lands in the right columns either way.
 */
async function widenHeader(
  title: string,
  header: readonly string[],
  spreadsheetId?: string,
): Promise<void> {
  const current = await sheetsFetch(
    `/values/${encodeURIComponent(title)}!1:1?majorDimension=ROWS`,
    undefined,
    spreadsheetId,
  );
  if (!current.ok) return;

  const data = (await current.json().catch(() => null)) as { values?: string[][] } | null;
  const existing = data?.values?.[0] ?? [];
  if (existing.length >= header.length) return;

  await sheetsFetch(
    `/values/${encodeURIComponent(title)}` +
      `!${columnLetter(existing.length + 1)}1:${columnLetter(header.length)}1` +
      `?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [header.slice(existing.length)] }) },
    spreadsheetId,
  );
}

/* -----------------------------------------------------------------------------
 * Popup signups — a separate spreadsheet
 * -------------------------------------------------------------------------- */

/**
 * The popup page captures a different shape of record from the house-party
 * invitation: one contact detail (mobile or email, not both), a name, and
 * whether the visitor took the calendar file. There is no party size, no
 * guest list, and no attending/declined. So it gets its own document rather
 * than another tab bolted onto a sheet whose columns mean something else —
 * and the admin dashboard that reads the RSVP sheet is untouched.
 */
export const POPUP_TAB = process.env.GOOGLE_POPUP_SHEET_TAB ?? "Signups";

/**
 * Columns A–I.
 *
 * F to I arrived with the model search, and they were appended rather than
 * slotted in where they read best. Everything already in the sheet keeps its
 * column: the calendar flag stays at E, so `markPopupCalendarAdded` still
 * aims at the right cell, and every row written before this change still
 * lines up with its headings. Inserting "Source" at B would have been tidier
 * to read and would have silently shifted every existing row's meaning by
 * one column.
 */
export const POPUP_HEADER_ROW = [
  "Submitted at (UTC)",
  "Name",
  "Email",
  "Phone",
  "Added to calendar",
  "Source",
  "Instagram",
  "Day",
  "Newsletter",
] as const;

/** The calendar flag is E, filled in after the fact. */
const POPUP_CALENDAR_COLUMN = "E";

/** The last column the append writes. Keep in step with POPUP_HEADER_ROW. */
const POPUP_LAST_COLUMN = "I";

/**
 * Which page a signup came from.
 *
 * Rows written before this column existed are blank, and blank means the
 * pop-up — it was the only page posting to this sheet at the time. So the
 * reader fills them in rather than showing a gap.
 */
export type SignupSource = "popup" | "model-search";

function popupSheetId(): string {
  const id = process.env.GOOGLE_POPUP_SHEET_ID;
  if (!id) throw new Error("GOOGLE_POPUP_SHEET_ID is not set.");
  return id;
}

export function isPopupSheetConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_POPUP_SHEET_ID,
  );
}

export type NewPopupSignup = {
  name: string;
  /** Exactly one of these is filled; the other column stays empty. */
  email: string;
  phone: string;
  /** Defaults to the pop-up, which is what wrote every row before this. */
  source?: SignupSource;
  /** Model search only: "@handle", or "" when they did not give one. */
  instagram?: string;
  /** Model search only: which day they said they would come. */
  day?: string;
  /**
   * Model search only. True ONLY when the visitor ticked the box — it is the
   * lawful basis for mailing them, so it is never inferred from the fact
   * that they registered.
   */
  newsletter?: boolean;
};

/**
 * Appends one signup and returns the row it landed on, so the calendar flag
 * can be filled in later.
 *
 * `valueInputOption: RAW` matters here: a number typed as `+44 7700 900123`
 * begins with a `+`, which the Sheets UI would read as a formula. RAW stores
 * it as the text it is.
 *
 * That is also why nothing here is prefixed with an apostrophe. The usual
 * advice — escape any cell starting with `= + @ -` — is for USER_ENTERED,
 * where Sheets parses what it is given. Under RAW it does not parse at all,
 * so an apostrophe would not be an escape: it would be a literal apostrophe
 * sitting in front of somebody's name.
 */
export async function appendPopupSignup(
  entry: NewPopupSignup,
): Promise<{ rowNumber: number | null }> {
  const id = popupSheetId();
  await ensureTab(POPUP_TAB, POPUP_HEADER_ROW, id);

  const at = new Date().toISOString().replace("T", " ").slice(0, 19);

  const row = [
    at,
    entry.name,
    entry.email,
    entry.phone,
    "",
    entry.source ?? "popup",
    entry.instagram ?? "",
    entry.day ?? "",
    // When consent was given, not just that it was. If these addresses are
    // ever imported into a mailing list, the date is the evidence.
    entry.newsletter ? `Yes — ${at}` : "",
  ];

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(POPUP_TAB)}!A:${POPUP_LAST_COLUMN}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
    id,
  );

  if (!response.ok) throw new Error(`Popup sheet append failed (${response.status})`);

  const data = (await response.json().catch(() => null)) as
    | { updates?: { updatedRange?: string } }
    | null;
  const match = data?.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
  return { rowNumber: match ? Number(match[1]) : null };
}

/**
 * Records that the visitor asked for the calendar file.
 *
 * Worth being precise about what this can and cannot know: the browser gives
 * no confirmation that a download completed or that anything was added to a
 * calendar. What is recorded is that the button was pressed, which is the
 * honest version of the question.
 */
export async function markPopupCalendarAdded(rowNumber: number): Promise<void> {
  const id = popupSheetId();
  const at = new Date().toISOString().replace("T", " ").slice(0, 19);

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(POPUP_TAB)}` +
      `!${POPUP_CALENDAR_COLUMN}${rowNumber}:${POPUP_CALENDAR_COLUMN}${rowNumber}` +
      `?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[`Yes — ${at}`]] }) },
    id,
  );

  if (!response.ok) throw new Error(`Popup calendar update failed (${response.status})`);
}

/**
 * Reads every popup signup, newest first.
 *
 * A missing tab is not an error: it simply means nobody has signed up yet,
 * because the tab is created by the first write.
 */
export async function readPopupSignups(solvedRows?: Set<number>): Promise<PopupRow[]> {
  const id = popupSheetId();

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(POPUP_TAB)}!A2:${POPUP_LAST_COLUMN}?majorDimension=ROWS`,
    undefined,
    id,
  );

  if (response.status === 400) return [];
  if (!response.ok) throw new Error(`Popup sheet read failed (${response.status})`);

  const data = (await response.json()) as { values?: string[][] };
  const rows = data.values ?? [];

  const parsed: PopupRow[] = rows.map((cells, index) => {
    // Sheets truncates trailing empty cells, so a row written before the
    // model-search columns existed arrives five long, not nine. Every
    // destructured default below is doing real work.
    const [
      submittedAt = "",
      name = "",
      email = "",
      phone = "",
      calendar = "",
      source = "",
      instagram = "",
      day = "",
      newsletter = "",
    ] = cells;
    return {
      // The sheet row number, so the key is stable across refreshes.
      id: String(index + 2),
      // Stored as "YYYY-MM-DD HH:MM:SS" in UTC. Spelling out the Z matters:
      // without it the browser reads it as local time and every row shifts by
      // the offset.
      created_at: submittedAt ? `${submittedAt.replace(" ", "T")}Z` : "",
      name,
      email,
      phone,
      calendar,
      // Blank predates the column, and only the pop-up was writing here then.
      source: source === "model-search" ? "model-search" : "popup",
      instagram,
      day,
      newsletter,
      egg: solvedRows ? solvedRows.has(index + 2) : false,
    };
  });

  return parsed.reverse();
}

/* ---- The easter egg ------------------------------------------------------
 * One row per completed puzzle, on its own tab of the popup spreadsheet, so
 * the count is just "how many rows" and each one carries when it happened.
 *
 * A solve is logged whether or not the visitor signed up — the puzzle is on
 * the page, not behind the form, and a count that only saw signups would not
 * answer the question. When they did sign up, their row number is recorded
 * alongside, so a solve can be matched to a person.
 * ---------------------------------------------------------------------- */
export const EGG_TAB = process.env.GOOGLE_POPUP_EGG_TAB ?? "Easter egg";

export const EGG_HEADER_ROW = ["Solved at (UTC)", "Signup row"] as const;

export async function appendEggSolve(signupRow: number | null): Promise<void> {
  const id = popupSheetId();
  await ensureTab(EGG_TAB, EGG_HEADER_ROW, id);

  const row = [
    new Date().toISOString().replace("T", " ").slice(0, 19),
    signupRow === null ? "" : String(signupRow),
  ];

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(EGG_TAB)}!A:B:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
    id,
  );

  if (!response.ok) throw new Error(`Egg append failed (${response.status})`);
}

export type EggTally = {
  /** Every completed puzzle. */
  total: number;
  /** The signup rows among them, so the dashboard can mark who solved it. */
  signupRows: number[];
};

/** A missing tab means nobody has solved it yet — not an error. */
export async function readEggSolves(): Promise<EggTally> {
  const id = popupSheetId();

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(EGG_TAB)}!A2:B?majorDimension=ROWS`,
    undefined,
    id,
  );

  if (response.status === 400) return { total: 0, signupRows: [] };
  if (!response.ok) throw new Error(`Egg read failed (${response.status})`);

  const data = (await response.json()) as { values?: string[][] };
  const rows = (data.values ?? []).filter((cells) => cells[0]);

  const signupRows = rows
    .map((cells) => Number(cells[1]))
    .filter((n) => Number.isInteger(n) && n > 1);

  return { total: rows.length, signupRows };
}

/**
 * The same question as describeSheet(), asked of the popup spreadsheet.
 *
 * Reports what is wrong rather than throwing, because the three failures look
 * identical from the outside and are fixed in three different places: the
 * variable is missing (Vercel, then redeploy), the ID is wrong (404), or the
 * document was never shared with the service account (403).
 */
export type PopupSheetStatus =
  | { configured: false; reason: string; hint: string }
  | {
      configured: true;
      spreadsheetId: string;
      title: string;
      url: string;
      tabs: string[];
      configuredTab: string;
      tabExists: boolean;
      rows: number | null;
      reachable: true;
    }
  | { configured: true; spreadsheetId: string; reachable: false; error: string; hint: string };

export async function describePopupSheet(): Promise<PopupSheetStatus> {
  const id = process.env.GOOGLE_POPUP_SHEET_ID;
  if (!id) {
    return {
      configured: false,
      reason: "GOOGLE_POPUP_SHEET_ID is not set on this deployment.",
      hint:
        "Add it in Vercel → Settings → Environment Variables, then REDEPLOY. " +
        "Vercel only applies new variables to deployments built after they are added.",
    };
  }

  try {
    const response = await sheetsFetch("?fields=properties.title,sheets.properties.title", undefined, id);
    if (!response.ok) {
      return {
        configured: true,
        spreadsheetId: id,
        reachable: false,
        error: `Google returned ${response.status}`,
        hint:
          response.status === 403
            ? "403 means the spreadsheet is not shared with the service account. Share it as Editor."
            : response.status === 404
              ? "404 means GOOGLE_POPUP_SHEET_ID does not match any spreadsheet. Check the ID in the sheet's URL."
              : "Check the ID and the sharing, then try again.",
      };
    }

    const data = (await response.json()) as {
      properties?: { title?: string };
      sheets?: { properties?: { title?: string } }[];
    };
    const tabs = (data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title));

    let rows: number | null = null;
    if (tabs.includes(POPUP_TAB)) {
      const values = await sheetsFetch(
        `/values/${encodeURIComponent(POPUP_TAB)}!A2:A?majorDimension=COLUMNS`,
        undefined,
        id,
      );
      if (values.ok) {
        const parsed = (await values.json()) as { values?: string[][] };
        rows = parsed.values?.[0]?.length ?? 0;
      }
    }

    return {
      configured: true,
      spreadsheetId: id,
      title: data.properties?.title ?? "(untitled)",
      url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      tabs,
      configuredTab: POPUP_TAB,
      tabExists: tabs.includes(POPUP_TAB),
      rows,
      reachable: true,
    };
  } catch (error) {
    return {
      configured: true,
      spreadsheetId: id,
      reachable: false,
      error: error instanceof Error ? error.message : "unknown",
      hint: "The request to Google failed before it got an answer.",
    };
  }
}

/* -----------------------------------------------------------------------------
 * Diagnostics
 * -------------------------------------------------------------------------- */

export type SheetIdentity = {
  spreadsheetId: string;
  title: string;
  url: string;
  tabs: string[];
  configuredTab: string;
  tabExists: boolean;
  serviceAccountEmail: string;
};

/**
 * Which document is this deployment actually writing to?
 *
 * Exists because "the form said it worked but the sheet is empty" is almost
 * always two spreadsheets, not a failed write — and from the outside there is
 * no way to tell which one the running server holds the ID for. Administrator
 * access only.
 */
export async function describeSheet(): Promise<SheetIdentity> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID ?? "";

  const response = await sheetsFetch("?fields=properties.title,sheets.properties.title");
  if (!response.ok) {
    throw new Error(`Sheets metadata failed (${response.status})`);
  }

  const data = (await response.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };

  const tabs = (data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));

  return {
    spreadsheetId,
    title: data.properties?.title ?? "(untitled)",
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    tabs,
    configuredTab: SHEET_TAB,
    tabExists: tabs.includes(SHEET_TAB),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
  };
}

/* -----------------------------------------------------------------------------
 * Reads
 * -------------------------------------------------------------------------- */

/** Reads every response for the configured event, newest first. */
export async function readRsvps(): Promise<RsvpRow[]> {
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(SHEET_TAB)}!${FIRST_COLUMN}2:${LAST_COLUMN}?majorDimension=ROWS`,
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
      email = "",
      consentAt = "",
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
      email: email || null,
      newsletter_consent_at: consentAt || null,
    });
  });

  return parsed.reverse(); // newest first
}
