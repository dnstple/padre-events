/**
 * Writes the header row into your Google Sheet.
 *
 *   npm run sheet:header
 *
 * Reads the same environment variables the app uses, so if this works your
 * credentials and sharing are correct — it doubles as a connection test.
 */
import { config, explain, getAccessToken, loadEnvLocal, requireConfig } from "./lib/google.mjs";

const HEADER = [
  "Submitted at (UTC)", "Event", "First name", "Last name", "Status", "Party size",
  "Guest 1 first", "Guest 1 last", "Guest 2 first", "Guest 2 last",
  "Guest 3 first", "Guest 3 last",
];

loadEnvLocal();
const c = config();
requireConfig(c);

const token = await getAccessToken(c);

const res = await fetch(
  `${c.api}/${c.sheetId}/values/${encodeURIComponent(c.tab)}!A1:L1?valueInputOption=RAW`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADER] }),
  },
);

if (!res.ok) {
  console.error(`Writing the header failed (${res.status}).`);
  console.error(explain(res.status, c));
  process.exit(1);
}

console.log(`Header written to "${c.tab}". Your credentials and sharing are correct.`);
