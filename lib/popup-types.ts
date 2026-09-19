/** Which page a signup came from. Blank cells in the sheet mean "popup". */
export type SignupSource = "popup" | "model-search";

/** One signup, as the admin surfaces see it. */
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
  /** Which page they came from. */
  source: SignupSource;
  /** Model search only: "@handle", or "" if they did not give one. */
  instagram: string;
  /** Model search only: "Either", "Saturday" or "Sunday". */
  day: string;
  /**
   * Model search only. The raw cell — "Yes — <UTC timestamp>" when they
   * ticked the box, "" otherwise. Only these people may be mailed.
   */
  newsletter: string;
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
  /** Split by page, so one number is not read as the other. */
  fromPopup: number;
  fromModelSearch: number;
  /** Model-search registrations that ticked the newsletter box. */
  newsletterOptIns: number;
};

export function summarisePopup(
  rows: readonly PopupRow[],
  eggSolved = 0,
): PopupTotals {
  let withMobile = 0;
  let withEmail = 0;
  let addedToCalendar = 0;
  let fromPopup = 0;
  let fromModelSearch = 0;
  let newsletterOptIns = 0;

  for (const row of rows) {
    if (row.phone) withMobile += 1;
    if (row.email) withEmail += 1;
    if (row.calendar) addedToCalendar += 1;
    if (row.source === "model-search") fromModelSearch += 1;
    else fromPopup += 1;
    if (row.newsletter) newsletterOptIns += 1;
  }

  return {
    signups: rows.length,
    withMobile,
    withEmail,
    addedToCalendar,
    eggSolved,
    fromPopup,
    fromModelSearch,
    newsletterOptIns,
  };
}
