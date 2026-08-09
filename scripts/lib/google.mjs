/**
 * Shared plumbing for the sheet scripts.
 *
 * Deliberately mirrors lib/sheets.ts rather than importing it — these scripts
 * run under plain Node with no bundler, and the point of them is to test the
 * credentials independently of the app.
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/** Loads .env.local into process.env without a dependency. Real env wins. */
export function loadEnvLocal(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
    return true;
  } catch {
    return false;
  }
}

export function config() {
  return {
    sheetId: process.env.GOOGLE_SHEET_ID,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    tab: process.env.GOOGLE_SHEET_TAB ?? "RSVPs",
    tokenUrl: process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    api: process.env.GOOGLE_SHEETS_API_URL ?? "https://sheets.googleapis.com/v4/spreadsheets",
  };
}

/** Exits with a readable message if anything required is missing. */
export function requireConfig(c) {
  const missing = [];
  if (!c.sheetId) missing.push("GOOGLE_SHEET_ID");
  if (!c.email) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!c.key) missing.push("GOOGLE_PRIVATE_KEY");
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}.`);
    console.error("Copy .env.example to .env.local and fill in the Google values.");
    process.exit(1);
  }
}

const b64 = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Signs a service-account JWT and swaps it for an access token. */
export async function getAccessToken(c) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(
    JSON.stringify({
      iss: c.email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: c.tokenUrl,
      iat: now,
      exp: now + 3600,
    }),
  );

  let sig;
  try {
    sig = b64(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(c.key));
  } catch {
    console.error("GOOGLE_PRIVATE_KEY is not a valid private key.");
    console.error('Paste the whole private_key value in double quotes, \\n escapes intact.');
    process.exit(1);
  }

  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${sig}`,
    }),
  });

  if (!res.ok) {
    console.error(`Google rejected the credentials (${res.status}).`);
    console.error("Check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.");
    process.exit(1);
  }

  return (await res.json()).access_token;
}

/** Explains a Sheets API status code in the terms that actually cause it. */
export function explain(status, c) {
  if (status === 401) return "The access token was rejected. Regenerate the service account key.";
  if (status === 403) return `The sheet is not shared with ${c.email}. Share it as Editor.`;
  if (status === 404) return `No spreadsheet with ID ${c.sheetId}. Check GOOGLE_SHEET_ID.`;
  if (status === 400) return `The range was rejected — usually no tab named "${c.tab}".`;
  return `Unexpected status ${status}.`;
}
