"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  MAX_ADDITIONAL_GUESTS,
  nameError,
  type Guest,
  type RsvpStatus,
} from "@/lib/name-rules";

import { eventConfig } from "@/config/event";
import Details from "@/components/Details";

import Confirmation from "./Confirmation";
import styles from "./rsvp.module.css";

/* -----------------------------------------------------------------------------
 * RSVP FLOW
 *
 * One question per state, in-page, no reload. The section's own surface colour
 * transitions from bone to near-black when the flow opens — the "panel" is the
 * page, not a modal.
 *
 * Client-side validation mirrors lib/validation.ts purely to keep the Next
 * button honest. The server re-validates everything and calculates party size.
 * -------------------------------------------------------------------------- */

type Phase = "prompt" | "attendance" | "name" | "guests" | "review" | "done";

const MAX_GUESTS = MAX_ADDITIONAL_GUESTS;

const emptyGuest = (): Guest => ({ first_name: "", last_name: "" });

type SubmittedRsvp = {
  first_name: string;
  last_name: string;
  rsvp_status: RsvpStatus;
  additional_guests: Guest[];
  party_size: number;
};

export default function RsvpSection() {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const [status, setStatus] = useState<RsvpStatus | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [guestCount, setGuestCount] = useState(0);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [honeypot, setHoneypot] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmittedRsvp | null>(null);

  const submitLock = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const promptButtonRef = useRef<HTMLButtonElement>(null);

  const uid = useId();

  /* ---- Step sequence ---------------------------------------------------- */
  const steps: Phase[] = useMemo(
    () =>
      status === "declined"
        ? ["attendance", "name", "review"]
        : ["attendance", "name", "guests", "review"],
    [status],
  );

  const stepIndex = steps.indexOf(phase);
  const totalSteps = steps.length;
  const isFlowStep = stepIndex >= 0;

  const pad = (n: number) => String(n).padStart(2, "0");

  /* ---- Focus management -------------------------------------------------- */
  useEffect(() => {
    if (phase === "prompt") return;
    // Focus the step heading so screen readers announce the new question and
    // keyboard users land in the right place.
    const id = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [phase]);

  /* ---- Live-region text -------------------------------------------------- */
  const liveMessage = (() => {
    if (phase === "done") return "";
    if (formError) return formError;
    const firstError = Object.values(errors)[0];
    if (firstError) return firstError;
    if (isFlowStep) return `Step ${stepIndex + 1} of ${totalSteps}.`;
    return "";
  })();

  /* ---- Guest rows follow the chosen count --------------------------------
   * Handled in the event handler rather than an effect: the row count is a
   * direct consequence of the user's choice, not state to synchronise. */
  const chooseGuestCount = useCallback((count: number) => {
    setGuestCount(count);
    setErrors({});
    setGuests((previous) => {
      if (count === previous.length) return previous;
      // Reducing the count discards the now-unused names entirely, so they
      // can never reach the review screen or the submission.
      if (count < previous.length) return previous.slice(0, count);
      return [...previous, ...Array.from({ length: count - previous.length }, emptyGuest)];
    });
  }, []);

  /* ---- Navigation -------------------------------------------------------- */
  const goTo = useCallback((next: Phase, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setErrors({});
    setFormError(null);
    setPhase(next);
  }, []);

  const open = useCallback(() => {
    goTo("attendance");
    // Bring the flow into view without hijacking the scroll position.
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }, [goTo]);

  const back = useCallback(() => {
    const previous = steps[stepIndex - 1];
    if (previous) goTo(previous, "back");
    else {
      setDirection("back");
      setPhase("prompt");
      window.requestAnimationFrame(() => promptButtonRef.current?.focus());
    }
  }, [goTo, stepIndex, steps]);

  /* ---- Per-step validation ----------------------------------------------- */
  function validateAttendance(): boolean {
    if (!status) {
      setErrors({ rsvp_status: "Please choose a response" });
      return false;
    }
    return true;
  }

  function validateName(): boolean {
    const next: Record<string, string> = {};
    const first = nameError(firstName);
    const last = nameError(lastName);
    if (first) next.first_name = first;
    if (last) next.last_name = last;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateGuests(): boolean {
    const next: Record<string, string> = {};
    guests.forEach((guest, index) => {
      const first = nameError(guest.first_name);
      const last = nameError(guest.last_name);
      if (first) next[`guests.${index}.first_name`] = first;
      if (last) next[`guests.${index}.last_name`] = last;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /* ---- Advance ------------------------------------------------------------ */
  function advance(event: React.FormEvent) {
    event.preventDefault();

    if (phase === "attendance") {
      if (!validateAttendance()) return;
      goTo("name");
      return;
    }

    if (phase === "name") {
      if (!validateName()) return;
      goTo(status === "declined" ? "review" : "guests");
      return;
    }

    if (phase === "guests") {
      if (!validateGuests()) return;
      goTo("review");
      return;
    }

    if (phase === "review") {
      void submit();
    }
  }

  /* ---- Submit ------------------------------------------------------------- */
  async function submit() {
    // Double-submit guard: a ref, because state updates are asynchronous and a
    // fast double-click can slip between renders.
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    const payload = {
      rsvp_status: status,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      additional_guests:
        status === "attending"
          ? guests.map((g) => ({
              first_name: g.first_name.trim(),
              last_name: g.last_name.trim(),
            }))
          : [],
      company: honeypot,
    };

    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setErrors(data?.errors ?? {});
        setFormError(
          data?.message ?? "We could not save your response. Please try again.",
        );
        submitLock.current = false;
        setSubmitting(false);
        return;
      }

      setResult(data.rsvp as SubmittedRsvp);
      setDirection("forward");
      setPhase("done");
      // Intentionally leave submitLock engaged — this flow submits once.
    } catch {
      setFormError("We could not reach the server. Please check your connection.");
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  /* ---- Restart ------------------------------------------------------------ */
  function restart() {
    submitLock.current = false;
    setSubmitting(false);
    setResult(null);
    setStatus(null);
    setFirstName("");
    setLastName("");
    setGuestCount(0);
    setGuests([]);
    setErrors({});
    setFormError(null);
    setDirection("back");
    setPhase("prompt");
    window.requestAnimationFrame(() => promptButtonRef.current?.focus());
  }

  const partySize = status === "attending" ? 1 + guests.length : 0;
  const flowOpen = phase !== "prompt";

  /* ------------------------------------------------------------------------ */
  return (
    <section
      id="rsvp"
      ref={sectionRef}
      className={styles.section}
      data-open={flowOpen}
      data-surface={flowOpen ? "dark" : "light"}
      aria-labelledby={`${uid}-rsvp-title`}
    >
      <div className={styles.inner}>
        {/* Announcements for assistive technology. */}
        <p aria-live="polite" aria-atomic="true" className="visually-hidden">
          {liveMessage}
        </p>

        {phase === "prompt" ? (
          <div className={styles.prompt}>
            <p className={styles.index}>
              <span className={styles.indexRule} aria-hidden="true" />
              <span>The details</span>
            </p>

            <Details />

            <div className={styles.reply}>
              <h2 id={`${uid}-rsvp-title`} className={styles.promptHeading}>
                Will you be <em>joining us?</em>
              </h2>

              <button
                ref={promptButtonRef}
                type="button"
                className={styles.action}
                onClick={open}
              >
                {eventConfig.labels.rsvpCta}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "done" && result ? (
          <Confirmation result={result} onReturn={restart} titleId={`${uid}-rsvp-title`} />
        ) : null}

        {isFlowStep ? (
          <form className={styles.flow} onSubmit={advance} noValidate>
            {/* Progress */}
            <div className={styles.progress}>
              <span>
                {pad(stepIndex + 1)} / {pad(totalSteps)}
              </span>
              <span className={styles.progressTrack} aria-hidden="true">
                <span
                  className={styles.progressFill}
                  style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                />
              </span>
            </div>

            {/* Honeypot */}
            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor={`${uid}-company`}>Company</label>
              <input
                id={`${uid}-company`}
                name="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {/* ---- Step 1: attendance ------------------------------------- */}
            {phase === "attendance" ? (
              <div className={styles.step} data-direction={direction}>
                <h2
                  id={`${uid}-rsvp-title`}
                  ref={headingRef}
                  tabIndex={-1}
                  className={styles.question}
                >
                  Will you be <em>joining us?</em>
                </h2>

                <fieldset className={styles.choices}>
                  <legend className="visually-hidden">Your response</legend>
                  {(
                    [
                      { value: "attending", label: "I’ll be there" },
                      { value: "declined", label: "Unable to attend" },
                    ] as const
                  ).map((option) => (
                    <label key={option.value} className={styles.choice}>
                      <input
                        className={styles.choiceInput}
                        type="radio"
                        name="rsvp_status"
                        value={option.value}
                        checked={status === option.value}
                        onChange={() => {
                          setStatus(option.value);
                          setErrors({});
                          if (option.value === "declined") {
                            // A declined response can never carry guests.
                            setGuestCount(0);
                            setGuests([]);
                          }
                        }}
                        aria-describedby={errors.rsvp_status ? `${uid}-status-error` : undefined}
                      />
                      <span className={styles.choiceMarker} aria-hidden="true" />
                      <span className={styles.choiceLabel}>{option.label}</span>
                    </label>
                  ))}
                </fieldset>

                <div className={styles.errorSlot}>
                  {errors.rsvp_status ? (
                    <span id={`${uid}-status-error`} className={styles.error} role="alert">
                      {errors.rsvp_status}
                    </span>
                  ) : null}
                </div>

                <div className={styles.actions}>
                  <button type="submit" className={styles.action}>
                    Continue
                  </button>
                  <button type="button" className={styles.secondary} onClick={back}>
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {/* ---- Step 2: name -------------------------------------------- */}
            {phase === "name" ? (
              <div className={styles.step} data-direction={direction}>
                <h2
                  id={`${uid}-rsvp-title`}
                  ref={headingRef}
                  tabIndex={-1}
                  className={styles.question}
                >
                  And your <em>name?</em>
                </h2>

                <fieldset className={styles.fields}>
                  <legend className="visually-hidden">Your name</legend>
                  <div className={styles.fieldRow}>
                    <TextField
                      id={`${uid}-first`}
                      label="First name"
                      autoComplete="given-name"
                      value={firstName}
                      error={errors.first_name}
                      onChange={setFirstName}
                    />
                    <TextField
                      id={`${uid}-last`}
                      label="Last name"
                      autoComplete="family-name"
                      value={lastName}
                      error={errors.last_name}
                      onChange={setLastName}
                    />
                  </div>
                </fieldset>

                <div className={styles.actions}>
                  <button type="submit" className={styles.action}>
                    Continue
                  </button>
                  <button type="button" className={styles.secondary} onClick={back}>
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {/* ---- Step 3: additional attendees ---------------------------- */}
            {phase === "guests" ? (
              <div className={styles.step} data-direction={direction}>
                <h2
                  id={`${uid}-rsvp-title`}
                  ref={headingRef}
                  tabIndex={-1}
                  className={styles.question}
                >
                  Will anyone be <em>joining you?</em>
                </h2>

                <fieldset className={`${styles.choices} ${styles.choicesCompact}`}>
                  <legend className="visually-hidden">Number of additional attendees</legend>
                  {Array.from({ length: MAX_GUESTS + 1 }, (_, count) => (
                    <label key={count} className={styles.choice}>
                      <input
                        className={styles.choiceInput}
                        type="radio"
                        name="guest_count"
                        value={count}
                        checked={guestCount === count}
                        onChange={() => chooseGuestCount(count)}
                      />
                      <span className={styles.choiceMarker} aria-hidden="true" />
                      <span className={styles.choiceLabel}>
                        {count === 0
                          ? "No, just me"
                          : count === 1
                            ? "One additional attendee"
                            : count === 2
                              ? "Two additional attendees"
                              : "Three additional attendees"}
                      </span>
                    </label>
                  ))}
                </fieldset>

                {guests.length > 0 ? (
                  <div className={styles.guestRows}>
                    {guests.map((guest, index) => (
                      <fieldset key={index} className={styles.guestRow}>
                        <legend className={styles.guestRowLabel}>Guest {index + 1}</legend>
                        <div className={styles.fieldRow}>
                          <TextField
                            id={`${uid}-guest-${index}-first`}
                            label="First name"
                            autoComplete="off"
                            value={guest.first_name}
                            error={errors[`guests.${index}.first_name`]}
                            onChange={(value) =>
                              setGuests((prev) =>
                                prev.map((g, i) =>
                                  i === index ? { ...g, first_name: value } : g,
                                ),
                              )
                            }
                          />
                          <TextField
                            id={`${uid}-guest-${index}-last`}
                            label="Last name"
                            autoComplete="off"
                            value={guest.last_name}
                            error={errors[`guests.${index}.last_name`]}
                            onChange={(value) =>
                              setGuests((prev) =>
                                prev.map((g, i) => (i === index ? { ...g, last_name: value } : g)),
                              )
                            }
                          />
                        </div>
                      </fieldset>
                    ))}
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <button type="submit" className={styles.action}>
                    Continue
                  </button>
                  <button type="button" className={styles.secondary} onClick={back}>
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {/* ---- Step 4: review ------------------------------------------ */}
            {phase === "review" ? (
              <div className={styles.step} data-direction={direction}>
                <h2
                  id={`${uid}-rsvp-title`}
                  ref={headingRef}
                  tabIndex={-1}
                  className={styles.question}
                >
                  Does this look <em>right?</em>
                </h2>

                <dl className={styles.review}>
                  <div className={styles.reviewRow}>
                    <dt className={styles.reviewTerm}>Name</dt>
                    <dd className={styles.reviewValue}>
                      {firstName.trim()} {lastName.trim()}
                    </dd>
                  </div>
                  <div className={styles.reviewRow}>
                    <dt className={styles.reviewTerm}>Response</dt>
                    <dd className={styles.reviewValue}>
                      {status === "attending" ? "Attending" : "Unable to attend"}
                    </dd>
                  </div>
                  {status === "attending" && guests.length > 0 ? (
                    <div className={styles.reviewRow}>
                      <dt className={styles.reviewTerm}>Joining you</dt>
                      <dd className={`${styles.reviewValue} ${styles.reviewList}`}>
                        {guests.map((guest, index) => (
                          <span key={index}>
                            {guest.first_name.trim()} {guest.last_name.trim()}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                  {status === "attending" ? (
                    <div className={styles.reviewRow}>
                      <dt className={styles.reviewTerm}>Party size</dt>
                      <dd className={styles.reviewValue}>
                        {partySize} {partySize === 1 ? "person" : "people"}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {formError ? (
                  <p className={styles.formError} role="alert">
                    {formError}
                  </p>
                ) : null}

                <p className={styles.privacy}>
                  Your details will only be used to manage this event.
                </p>

                <div className={styles.actions}>
                  <button type="submit" className={styles.action} disabled={submitting}>
                    {submitting ? "Sending…" : "Confirm RSVP"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={back}
                    disabled={submitting}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------------
 * Text field — label always visible, error bound via aria-describedby, and the
 * error slot reserved so validation never reflows the layout.
 * -------------------------------------------------------------------------- */
function TextField({
  id,
  label,
  value,
  error,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="text"
        maxLength={80}
        autoComplete={autoComplete}
        autoCapitalize="words"
        spellCheck={false}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className={styles.errorSlot}>
        {error ? (
          <span id={`${id}-error`} className={styles.error} role="alert">
            {error}
          </span>
        ) : null}
      </span>
    </div>
  );
}
