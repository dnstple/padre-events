import "server-only";

import { ensureTab, sheetsFetch } from "@/lib/sheets";

/* -----------------------------------------------------------------------------
 * Padre65 × Kiez — 17 October 2026
 *
 * Its own spreadsheet (see kiezSheetId) and its own tabs. The pop-up and model-search rows
 * share a tab because they were the same weekend; this is a different night,
 * and a guest count that mixed them would answer neither question.
 *
 * Every row also carries the event identifier, so an export taken out of the
 * sheet still says which night it belongs to.
 *
 * Rows sent with `test: true` land on parallel "(test)" tabs and are never
 * counted. Nothing a real guest's browser sends sets that flag.
 * -------------------------------------------------------------------------- */

export const KIEZ_EVENT_ID = "padre65-kiez-2026-10-17";

/**
 * Kiez has a spreadsheet of its own (GOOGLE_KIEZ_SHEET_ID). Unset, it falls
 * back to the pop-up's, which is where the first Kiez rows were written.
 * Either document must be shared with the service account as Editor.
 */
function kiezSheetId(): string {
  const id = process.env.GOOGLE_KIEZ_SHEET_ID || process.env.GOOGLE_POPUP_SHEET_ID;
  if (!id) throw new Error("GOOGLE_KIEZ_SHEET_ID is not set.");
  return id;
}

export function isKiezSheetConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      (process.env.GOOGLE_KIEZ_SHEET_ID || process.env.GOOGLE_POPUP_SHEET_ID),
  );
}

const KIEZ_TAB = process.env.GOOGLE_KIEZ_TAB ?? "Kiez RSVPs";
const KIEZ_PHOTO_TAB = process.env.GOOGLE_KIEZ_PHOTO_TAB ?? "Kiez photo drop";

function tabFor(kind: "rsvp" | "photo", test: boolean): string {
  const base = kind === "rsvp" ? KIEZ_TAB : KIEZ_PHOTO_TAB;
  return test ? `${base} (test)` : base;
}

/** Columns A–J. The calendar flag is G, filled in after the fact. */
const KIEZ_HEADER_ROW = [
  "Submitted at (UTC)",
  "Event",
  "Name",
  "Contact method",
  "Email",
  "Phone",
  "Added to calendar",
  "Referrer",
  "Campaign (UTM)",
  "Request ID",
] as const;

const LAST_COLUMN = "J";
const CALENDAR_COLUMN = "G";

const PHOTO_HEADER_ROW = ["Submitted at (UTC)", "Event", "Email", "Request ID"] as const;

export type NewKiezRsvp = {
  name: string;
  method: "email" | "mobile";
  /** Exactly one of these is filled. */
  email: string;
  phone: string;
  referrer: string;
  campaign: string;
  requestId: string;
  test: boolean;
};

export type KiezExisting = {
  rowNumber: number;
  requestId: string;
  email: string;
  /** Digits only, compared by their last nine so 07… and +44 7… match. */
  phoneDigits: string;
};

function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function rowFromRange(range: string | undefined): number | null {
  const match = range?.match(/![A-Z]+(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * The contact details and request IDs already on a tab, for duplicate checks.
 * A missing tab is an empty list — the first write creates it.
 *
 * Reading the whole tab per signup is fine at the size of one night's guest
 * list. It is what makes a retry that lands on a different server instance
 * safe, which an in-memory cache alone cannot promise.
 */
export async function readKiezExisting(test: boolean): Promise<KiezExisting[]> {
  const id = kiezSheetId();
  const tab = tabFor("rsvp", test);
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(tab)}!A2:${LAST_COLUMN}?majorDimension=ROWS`,
    undefined,
    id,
  );
  if (response.status === 400) return [];
  if (!response.ok) throw new Error(`Kiez read failed (${response.status})`);

  const data = (await response.json()) as { values?: string[][] };
  return (data.values ?? []).map((cells, index) => ({
    rowNumber: index + 2,
    email: (cells[4] ?? "").toLowerCase(),
    phoneDigits: (cells[5] ?? "").replace(/\D/g, ""),
    requestId: cells[9] ?? "",
  }));
}

export async function appendKiezRsvp(entry: NewKiezRsvp): Promise<{ rowNumber: number | null }> {
  const id = kiezSheetId();
  const tab = tabFor("rsvp", entry.test);
  await ensureTab(tab, KIEZ_HEADER_ROW, id);

  const row = [
    stamp(),
    KIEZ_EVENT_ID,
    entry.name,
    entry.method === "email" ? "Email" : "Mobile",
    entry.email,
    entry.phone,
    "",
    entry.referrer,
    entry.campaign,
    entry.requestId,
  ];

  // RAW, for the reason given on appendPopupSignup: "+44…" stays text.
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(tab)}!A:${LAST_COLUMN}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
    id,
  );
  if (!response.ok) throw new Error(`Kiez append failed (${response.status})`);

  const data = (await response.json().catch(() => null)) as
    | { updates?: { updatedRange?: string } }
    | null;
  return { rowNumber: rowFromRange(data?.updates?.updatedRange) };
}

/** Same honesty as markPopupCalendarAdded: the button was pressed, no more. */
export async function markKiezCalendarAdded(rowNumber: number, test: boolean): Promise<void> {
  const id = kiezSheetId();
  const tab = tabFor("rsvp", test);
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(tab)}` +
      `!${CALENDAR_COLUMN}${rowNumber}:${CALENDAR_COLUMN}${rowNumber}` +
      `?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[`Yes — ${stamp()}`]] }) },
    id,
  );
  if (!response.ok) throw new Error(`Kiez calendar update failed (${response.status})`);
}

/**
 * One address asking to hear when this night's photos are up. Its own tab,
 * because it is its own permission: not an RSVP, and not newsletter consent.
 * Returns added:false when the address is already waiting.
 */
export async function appendKiezPhotoDrop(
  email: string,
  requestId: string,
  test: boolean,
): Promise<{ added: boolean }> {
  const id = kiezSheetId();
  const tab = tabFor("photo", test);
  await ensureTab(tab, PHOTO_HEADER_ROW, id);

  const existing = await sheetsFetch(
    `/values/${encodeURIComponent(tab)}!C2:D?majorDimension=ROWS`,
    undefined,
    id,
  );
  if (!existing.ok) throw new Error(`Kiez photo-drop read failed (${existing.status})`);
  const data = (await existing.json()) as { values?: string[][] };
  const seen = (data.values ?? []).some(
    (cells) =>
      (cells[0] ?? "").toLowerCase() === email.toLowerCase() || (requestId !== "" && cells[1] === requestId),
  );
  if (seen) return { added: false };

  const response = await sheetsFetch(
    `/values/${encodeURIComponent(tab)}!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [[stamp(), KIEZ_EVENT_ID, email, requestId]] }) },
    id,
  );
  if (!response.ok) throw new Error(`Kiez photo-drop append failed (${response.status})`);
  return { added: true };
}

export type KiezRow = {
  id: string;
  created_at: string;
  name: string;
  method: string;
  email: string;
  phone: string;
  calendar: string;
  referrer: string;
  campaign: string;
};

/** Every real RSVP for the night, newest first. Never reads the test tab. */
export async function readKiezRsvps(): Promise<KiezRow[]> {
  const id = kiezSheetId();
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(KIEZ_TAB)}!A2:${LAST_COLUMN}?majorDimension=ROWS`,
    undefined,
    id,
  );
  if (response.status === 400) return [];
  if (!response.ok) throw new Error(`Kiez read failed (${response.status})`);

  const data = (await response.json()) as { values?: string[][] };
  return (data.values ?? [])
    .map((cells, index) => {
      const [at = "", , name = "", method = "", email = "", phone = "", calendar = "", referrer = "", campaign = ""] =
        cells;
      return {
        id: String(index + 2),
        created_at: at ? `${at.replace(" ", "T")}Z` : "",
        name,
        method,
        email,
        phone,
        calendar,
        referrer,
        campaign,
      };
    })
    .filter((row) => row.name)
    .reverse();
}

/** How many addresses are waiting for the photos. Never counts the test tab. */
export async function countKiezPhotoDrop(): Promise<number> {
  const id = kiezSheetId();
  const response = await sheetsFetch(
    `/values/${encodeURIComponent(KIEZ_PHOTO_TAB)}!C2:C?majorDimension=COLUMNS`,
    undefined,
    id,
  );
  if (response.status === 400) return 0;
  if (!response.ok) throw new Error(`Kiez photo-drop read failed (${response.status})`);
  const data = (await response.json()) as { values?: string[][] };
  return (data.values?.[0] ?? []).filter(Boolean).length;
}
