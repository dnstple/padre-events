"use client";

import { useEffect, useRef } from "react";

import { eventConfig } from "@/config/event";
import type { Guest, RsvpStatus } from "@/lib/name-rules";

import styles from "./rsvp.module.css";

type Props = {
  result: {
    first_name: string;
    last_name: string;
    rsvp_status: RsvpStatus;
    additional_guests: Guest[];
    party_size: number;
  };
  onReturn: () => void;
  titleId: string;
};

/**
 * SUCCESS STATE
 *
 * No claim of a confirmation email — no email address was ever collected.
 * The heading receives focus so the outcome is announced immediately.
 */
export default function Confirmation({ result, onReturn, titleId }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const attending = result.rsvp_status === "attending";
  const guests = Array.isArray(result.additional_guests) ? result.additional_guests : [];

  useEffect(() => {
    const id = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div className={styles.confirmation}>
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
              <dt className={styles.reviewTerm}>Date</dt>
              <dd className={styles.reviewValue}>
                <time dateTime={eventConfig.dateISO}>{eventConfig.dateDisplay}</time>
              </dd>
            </div>
            <div className={styles.reviewRow}>
              <dt className={styles.reviewTerm}>Time</dt>
              <dd className={styles.reviewValue}>
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

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onReturn}>
          Return to the invitation
        </button>
      </div>
    </div>
  );
}
