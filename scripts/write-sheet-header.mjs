/**
 * Writes the header row into your Google Sheet.
 *
 *   npm run sheet:header
 *
 * Reads the same environment variables the app uses, so if this works your
 * credentials and sharing are correct — it doubles as a connection test.
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// Load .env.local without a dependency.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
} catch {
  /* no .env.local — rely on the real environment */
}

const {
  GOOGLE_SHEET_ID: SHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: EMAIL,
  GOOGLE_SHEET_TAB: TAB = "RSVPs",
} = process.env;
const KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const API = process.env.GOOGLE_SHEETS_API_URL ?? "https://sheets.googleapis.com/v4/spreadsheets";

const HEADER = [
  "Submitted at (UTC)", "Event", "First name", "Last name", "Status", "Party size",
  "Guest 1 first", "Guest 1 last", "Guest 2 first", "Guest 2 last",
  "Guest 3 first", "Guest 3 last",
];

if (!SHEET_ID || !EMAIL || !KEY) {
  console.error("Missing GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY.");
  process.exit(1);
}

const b64 = (i) => Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64(JSON.stringify({
  iss: EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets",
  aud: TOKEN_URL, iat: now, exp: now + 3600,
}));
const sig = b64(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(KEY));

const tokenRes = await fetch(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${header}.${claims}.${sig}`,
  }),
});

if (!tokenRes.ok) {
  console.error(`Google rejected the credentials (${tokenRes.status}).`);
  console.error("Check GOOGLE_PRIVATE_KEY is the full value with \\n escapes intact.");
  process.exit(1);
}

const { access_token } = await tokenRes.json();

const res = await fetch(
  `${API}/${SHEET_ID}/values/${encodeURIComponent(TAB)}!A1:L1?valueInputOption=RAW`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADER] }),
  },
);

if (!res.ok) {
  console.error(`Writing the header failed (${res.status}).`);
  if (res.status === 403) console.error(`Share the sheet with ${EMAIL} as Editor.`);
  if (res.status === 404) console.error(`Check GOOGLE_SHEET_ID, and that a tab called "${TAB}" exists.`);
  process.exit(1);
}

console.log(`Header written to "${TAB}". Your credentials and sharing are correct.`);
