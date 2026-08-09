import { z } from "zod";

import { MAX_ADDITIONAL_GUESTS, nameError, normaliseName } from "@/lib/name-rules";

export { calculatePartySize } from "@/lib/name-rules";
export type { Guest, RsvpStatus } from "@/lib/name-rules";

/**
 * Server-side validation.
 *
 * The field rules themselves live in lib/name-rules.ts so that the browser and
 * the server enforce exactly the same thing with exactly the same wording. This
 * module adds the structural parsing — shape, types, unknown-key stripping —
 * that only the server needs.
 *
 * The server never trusts the client's copy: every request is re-parsed here.
 */

export const nameSchema = z
  .string({ error: "Required" })
  .transform(normaliseName)
  .superRefine((value, ctx) => {
    const error = nameError(value);
    if (error) ctx.addIssue({ code: "custom", message: error });
  });

export const guestSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
});

export const rsvpStatusSchema = z.enum(["attending", "declined"], {
  error: "Please choose a response",
});

/**
 * The public submission payload.
 *
 * Note what is NOT here: no party_size, no event_slug, no id. The server sets
 * those. Unknown keys are stripped by Zod rather than forwarded to the database.
 */
export const rsvpSubmissionSchema = z
  .object({
    rsvp_status: rsvpStatusSchema,
    first_name: nameSchema,
    last_name: nameSchema,
    additional_guests: z
      .array(guestSchema)
      .max(
        MAX_ADDITIONAL_GUESTS,
        `A maximum of ${MAX_ADDITIONAL_GUESTS} additional guests`,
      )
      .default([]),
    /**
     * Honeypot. Real people never see this field, so it must stay empty.
     * A filled value is accepted by the schema on purpose — the route handler
     * then returns a normal-looking success without writing anything, so a bot
     * learns nothing about why it failed.
     */
    company: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rsvp_status === "declined" && value.additional_guests.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["additional_guests"],
        message: "A declined response cannot include additional guests",
      });
    }
  });

export type RsvpSubmission = z.infer<typeof rsvpSubmissionSchema>;

/** Maximum accepted request body, in bytes. A valid RSVP is well under 1 KB. */
export const MAX_BODY_BYTES = 4096;

/** Flattens a ZodError into `{ fieldPath: message }` for inline display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
