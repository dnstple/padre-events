"use client";

import { useId, useRef, useState } from "react";

import { eventConfig } from "@/config/event";
import { emailError, MAX_EMAIL_LENGTH, normaliseEmail } from "@/lib/email-rules";

import styles from "./rsvp.module.css";

type Props = {
  /** Signed reference to the row this guest's response created. */
  token: string;
};

type Phase = "idle" | "sending" | "done";

/**
 * OPTIONAL NEWSLETTER OPT-IN
 *
 * Deliberately subordinate to the confirmation above it: the guest has already
 * finished, and this must not read as another required step. Hence the quieter
 * heading, the secondary button treatment, and no error state for simply
 * ignoring it.
 *
 * Submitting is the consent, so the sentence describing what they will receive
 * sits directly above the button rather than in a footnote — it is the thing
 * being agreed to, and the server stores a timestamp against it.
 */
export default function NewsletterOptIn({ token }: Props) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const lock = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || phase === "done") return;

    const message = emailError(email);
    if (message) {
      setError(message);
      return;
    }

    lock.current = true;
    setPhase("sending");
    setError(null);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: normaliseEmail(email),
          company: honeypot,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "We could not save that. Please try again.");
        setPhase("idle");
        lock.current = false;
        return;
      }

      setPhase("done");
    } catch {
      setError("We could not reach the server. Please check your connection.");
      setPhase("idle");
      lock.current = false;
    }
  }

  if (phase === "done") {
    return (
      <div className={styles.newsletter}>
        <p role="status" aria-live="polite" className={styles.newsletterDone}>
          {eventConfig.newsletter.success}
        </p>
      </div>
    );
  }

  return (
    <form className={styles.newsletter} onSubmit={submit} noValidate>
      <h3 className={styles.newsletterHeading}>{eventConfig.newsletter.heading}</h3>
      <p className={styles.newsletterBody} id={`${uid}-promise`}>
        {eventConfig.newsletter.body}
      </p>

      {/* Matches the RSVP form's honeypot. */}
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

      <div className={styles.newsletterRow}>
        <div className={styles.newsletterField}>
          <label className="visually-hidden" htmlFor={`${uid}-email`}>
            {eventConfig.newsletter.placeholder}
          </label>
          <input
            id={`${uid}-email`}
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={MAX_EMAIL_LENGTH}
            placeholder={eventConfig.newsletter.placeholder}
            aria-describedby={`${uid}-promise`}
            aria-invalid={error ? true : undefined}
            aria-errormessage={error ? `${uid}-error` : undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            disabled={phase === "sending"}
          />
        </div>

        <button
          type="submit"
          className={styles.newsletterButton}
          disabled={phase === "sending"}
        >
          {phase === "sending" ? "Signing you up…" : eventConfig.newsletter.cta}
        </button>
      </div>

      <p
        id={`${uid}-error`}
        role="alert"
        className={error ? styles.newsletterError : "visually-hidden"}
      >
        {error ?? ""}
      </p>
    </form>
  );
}
