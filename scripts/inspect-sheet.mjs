/**
 * Shows exactly what the app sees in your Google Sheet.
 *
 *   npm run sheet:check
 *
 * Prints which spreadsheet the credentials actually open, what its tabs are
 * called, and every row currently in the RSVP tab. If a response reached Google
 * but you cannot find it, this is the fastest way to see where it went.
 *
 * Read-only. It never writes, and it never prints the private key.
 */
import { config, explain, getAccessToken, loadEnvLocal, requireConfig } from "./lib/google.mjs";

const loaded = loadEnvLocal();
const c = config();
requireConfig(c);

console.log(`\nReading with these settings${loaded ? " (from .env.local)" : ""}:`);
console.log(`  GOOGLE_SHEET_ID                ${c.sheetId}`);
console.log(`  GOOGLE_SERVICE_ACCOUNT_EMAIL   ${c.email}`);
console.log(`  tab                            ${c.tab}${process.env.GOOGLE_SHEET_TAB ? "" : "  (default)"}`);

const token = await getAccessToken(c);
const auth = { Authorization: `Bearer ${token}` };

/* -- 1. Which document is this, really? ------------------------------------ */
const metaRes = await fetch(
  `${c.api}/${c.sheetId}?fields=properties.title,sheets.properties.title`,
  { headers: auth },
);

if (!metaRes.ok) {
  console.error(`\nCould not open the spreadsheet (${metaRes.status}).`);
  console.error(explain(metaRes.status, c));
  process.exit(1);
}

const meta = await metaRes.json();
const tabs = (meta.sheets ?? []).map((s) => s.properties.title);

console.log(`\nSpreadsheet:  "${meta.properties?.title}"`);
console.log(`URL:          https://docs.google.com/spreadsheets/d/${c.sheetId}/edit`);
console.log(`Tabs:         ${tabs.map((t) => `"${t}"`).join(", ")}`);

if (!tabs.includes(c.tab)) {
  console.error(`\nThere is no tab called "${c.tab}" in this spreadsheet.`);
  console.error(`Rename a tab to "${c.tab}", or set GOOGLE_SHEET_TAB to one of the names above.`);
  process.exit(1);
}

/* -- 2. What is in it? ------------------------------------------------------ */
const valuesRes = await fetch(
  `${c.api}/${c.sheetId}/values/${encodeURIComponent(c.tab)}!A1:L?majorDimension=ROWS`,
  { headers: auth },
);

if (!valuesRes.ok) {
  console.error(`\nCould not read the tab (${valuesRes.status}).`);
  console.error(explain(valuesRes.status, c));
  process.exit(1);
}

const rows = (await valuesRes.json()).values ?? [];

if (rows.length === 0) {
  console.log(`\nThe "${c.tab}" tab is completely empty — not even a header row.`);
  console.log("Run `npm run sheet:header`, then submit a test RSVP.");
  process.exit(0);
}

console.log(`\n${rows.length} row${rows.length === 1 ? "" : "s"} in "${c.tab}" (A1:L):\n`);

rows.forEach((cells, i) => {
  const rowNumber = i + 1;
  const summary = cells.map((v) => (v === "" ? "·" : v)).join(" | ");
  console.log(`  ${String(rowNumber).padStart(4)}  ${summary || "(blank)"}`);
});

/* -- 3. Anything that looks like a stray value pushing appends down? -------- */
const dataRows = rows.slice(1);
const filled = dataRows.filter((cells) => cells.some((v) => String(v).trim() !== ""));

console.log(`\n${filled.length} response row${filled.length === 1 ? "" : "s"} below the header.`);

if (dataRows.length > filled.length) {
  console.log(
    `${dataRows.length - filled.length} blank row(s) are interleaved. A stray value anywhere ` +
      `in A–L makes new responses append below it, which is why one can look missing.`,
  );
}
