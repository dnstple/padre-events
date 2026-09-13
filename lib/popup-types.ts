/** One popup signup, as the admin surfaces see it. */
export type PopupRow = {
  id: string;
  /** ISO 8601. The sheet stores "YYYY-MM-DD HH:MM:SS" in UTC. */
  created_at: string;
  name: string;
  /** Exactly one of these is filled — the page asks for one or the other. */
  email: string;
  phone: string;
  /** The raw cell: "" when they did not take the calendar file. */
  calendar: string;
  /** True when this signup also finished the easter egg. */
  egg: boolean;
};

export type PopupTotals = {
  signups: number;
  withMobile: number;
  withEmail: number;
  addedToCalendar: number;
  /** Every completed puzzle, including visitors who never signed up. */
  eggSolved: number;
};

export function summarisePopup(
  rows: readonly PopupRow[],
  eggSolved = 0,
): PopupTotals {
  let withMobile = 0;
  let withEmail = 0;
  let addedToCalendar = 0;

  for (const row of rows) {
    if (row.phone) withMobile += 1;
    if (row.email) withEmail += 1;
    if (row.calendar) addedToCalendar += 1;
  }

  return { signups: rows.length, withMobile, withEmail, addedToCalendar, eggSolved };
}
