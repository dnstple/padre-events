"use client";

import { useEffect, useRef } from "react";

import { eventConfig } from "@/config/event";
import type { Guest, RsvpStatus } from "@/lib/name-rules";

import NewsletterOptIn from "./NewsletterOptIn";
import styles from "./rsvp.module.css";

type Props = {
  result: {
    first_name: string;
    last_name: string;
    rsvp_status: RsvpStatus;
    additional_guests: Guest[];
    party_size: number;
  };
  /** Signed reference to the sheet row this response created, if any. */
  emailToken: string | null;
  onReturn: () => void;
  titleId: string;
};

/**
 * SUCCESS STATE
 *
 * Makes no claim that a confirmation email has been sent, because none is.
 * The heading receives focus so the outcome is announced immediately.
 *
 * The newsletter opt-in below is genuinely optional and comes after the
 * outcome, so nobody has to give an address to reply to the invitation.
 */
export default function Confirmation({ result, emailToken, onReturn, titleId }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const attending = result.rsvp_status === "attending";
  const guests = Array.isArray(result.additional_guests) ? result.additional_guests : [];

  useEffect(() => {
    // Focus without scrolling. Letting the browser do it puts the heading at
    // the top of the viewport, which pushes the newsletter opt-in below the
    // fold — the one thing this screen must not do.
    headingRef.current?.focus({ preventScroll: true });

    const root = rootRef.current;
    if (!root) return;

    const id = window.requestAnimationFrame(() => {
      // offsetHeight is layout height, so the entrance animation's transform
      // cannot skew the decision.
      const fits = root.offsetHeight <= window.innerHeight - 24;
      root.scrollIntoView({
        // Centred when the whole thing fits, so nothing is cut off at either
        // end; top-aligned when it cannot, so at least the outcome is read
        // first and the rest is one obvious scroll away.
        block: fits ? "center" : "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div className={styles.confirmation} ref={rootRef}>
      {/* Assertive: the submission outcome should interrupt. */}
      <p role="status" aria-live="assertive" className="visually-hidden">
        {attending
          ? `You are on the list. ${result.party_size} ${result.party_size === 1 ? "person" : "people"} confirmed for ${eventConfig.dateShort}.`
          : "Thank you for letting us know. Your response has been recorded."}
      </p>

      <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.confirmHeading}>
        {attending ? (
          <>
            You’re <em>on the list.</em>
          </>
        ) : (
          <>
            Thank you for <em>letting us know.</em>
          </>
        )}
      </h2>

      <p className={styles.confirmBody}>
        {attending
          ? `We look forward to seeing you on ${eventConfig.dateShort}.`
          : "We hope to see you at the next one."}
      </p>

      {attending ? (
        <>
          <div className={styles.confirmRule} aria-hidden="true" />
          <dl className={styles.review}>
            <div className={styles.reviewRow}>
              <dt className={styles.reviewTerm}>Guest</dt>
              <dd className={styles.reviewValue}>
                {result.first_name} {result.last_name}
              </dd>
            </div>
            {guests.length > 0 ? (
              <div className={styles.reviewRow}>
                <dt className={styles.reviewTerm}>Joining you</dt>
                <dd className={`${styles.reviewValue} ${styles.reviewList}`}>
                  {guests.map((guest, index) => (
                    <span key={index}>
                      {guest.first_name} {guest.last_name}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            <div className={styles.reviewRow}>
              <dt className={styles.reviewTerm}>Party size</dt>
              <dd className={styles.reviewValue}>
                {result.party_size} {result.party_size === 1 ? "person" : "people"}
              </dd>
            </div>
            <div className={styles.reviewRow}>
              <dt className={styles.reviewTerm}>When</dt>
              <dd className={styles.reviewValue}>
                <time dateTime={eventConfig.dateISO}>{eventConfig.dateDisplay}</time>
                {" · "}
                {eventConfig.doorsTime} — {eventConfig.finishTime.toLowerCase()}
              </dd>
            </div>
            <div className={styles.reviewRow}>
              <dt className={styles.reviewTerm}>Venue</dt>
              <dd className={styles.reviewValue}>
                {eventConfig.venue}
                {eventConfig.address ? (
                  <>
                    <br />
                    {eventConfig.address}
                  </>
                ) : null}
              </dd>
            </div>
          </dl>
        </>
      ) : null}

      {/* Optional, and only when the server handed back a row to attach it to. */}
      {eventConfig.newsletter.enabled && emailToken ? (
        <NewsletterOptIn token={emailToken} />
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onReturn}>
          Return to the invitation
        </button>
      </div>
    </div>
  );
}
