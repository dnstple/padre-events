import type { Guest, RsvpStatus } from "@/lib/name-rules";

/** One stored response, as the admin surfaces see it. */
export type RsvpRow = {
  id: string;
  first_name: string;
  last_name: string;
  rsvp_status: RsvpStatus;
  additional_guests: Guest[];
  party_size: number;
  created_at: string;
};

export type RsvpTotals = {
  /** Every submission, attending or declined. */
  responses: number;
  /** Attending submissions (main guests only). */
  attendingMainGuests: number;
  /** Additional attendees brought by attending guests. */
  additionalAttendees: number;
  /** attendingMainGuests + additionalAttendees. */
  expectedHeadcount: number;
  declined: number;
};

export function summarise(rows: readonly RsvpRow[]): RsvpTotals {
  let attendingMainGuests = 0;
  let additionalAttendees = 0;
  let declined = 0;

  for (const row of rows) {
    if (row.rsvp_status === "attending") {
      attendingMainGuests += 1;
      additionalAttendees += Array.isArray(row.additional_guests)
        ? row.additional_guests.length
        : 0;
    } else {
      declined += 1;
    }
  }

  return {
    responses: rows.length,
    attendingMainGuests,
    additionalAttendees,
    expectedHeadcount: attendingMainGuests + additionalAttendees,
    declined,
  };
}

/** "Ada Lovelace, Grace Hopper" — used by the table and the CSV. */
export function guestNames(guests: readonly Guest[] | null | undefined): string[] {
  if (!Array.isArray(guests)) return [];
  return guests
    .map((guest) => `${guest?.first_name ?? ""} ${guest?.last_name ?? ""}`.trim())
    .filter(Boolean);
}
