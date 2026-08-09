"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { guestNames, type RsvpRow, type RsvpTotals } from "@/lib/rsvp-types";

import styles from "./admin.module.css";

/* -----------------------------------------------------------------------------
 * Guest list.
 *
 * Data refresh is authenticated polling every 10 seconds, plus a refresh on
 * window focus and a visible manual control. Google Sheets has no push channel,
 * and the sheet is only ever read server-side by an authenticated route, so
 * polling an endpoint that checks the session on every request is both the
 * simplest option and the one that never exposes the list to the browser
 * without a valid session.
 * -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 10_000;

type Filter = "all" | "attending" | "declined";
type SortDirection = "desc" | "asc";

type Payload = {
  ok: boolean;
  rows: RsvpRow[];
  totals: RsvpTotals;
  fetchedAt: string;
  message?: string;
};

const EMPTY_TOTALS: RsvpTotals = {
  responses: 0,
  attendingMainGuests: 0,
  additionalAttendees: 0,
  expectedHeadcount: 0,
  declined: 0,
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatClock(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function StatusTag({ status }: { status: RsvpRow["rsvp_status"] }) {
  const attending = status === "attending";
  return (
    <span
      className={`${styles.status} ${attending ? styles.statusAttending : styles.statusDeclined}`}
    >
      {/* Filled vs hollow square — the distinction survives without colour. */}
      <span className={styles.statusGlyph} aria-hidden="true" />
      {attending ? "Attending" : "Declined"}
    </span>
  );
}

export default function Dashboard() {
  const [rows, setRows] = useState<RsvpRow[]>([]);
  const [totals, setTotals] = useState<RsvpTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortDirection>("desc");

  const inFlight = useRef(false);
  const router = useRouter();

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === "refresh") setRefreshing(true);

    try {
      const response = await fetch("/api/admin/rsvps", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (response.status === 401) {
        // The session expired while the tab was open.
        router.replace("/admin/login");
        return;
      }

      const data = (await response.json().catch(() => null)) as Payload | null;

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "We could not load the guest list.");
        return;
      }

      setRows(data.rows);
      setTotals(data.totals);
      setLastUpdated(new Date(data.fetchedAt));
      setError(null);
    } catch {
      setError("We could not reach the server. Retrying automatically.");
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  /* Initial load, 10s polling, and refresh on focus / tab visibility. */
  useEffect(() => {
    // The first load is queued rather than called inline so the effect body
    // itself performs no state update.
    const initial = window.setTimeout(() => void load("initial"), 0);

    const interval = window.setInterval(() => void load("refresh"), POLL_INTERVAL_MS);
    const onFocus = () => void load("refresh");
    const onVisible = () => {
      if (document.visibilityState === "visible") void load("refresh");
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /* ---- Search, filter, sort ---------------------------------------------- */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (filter !== "all" && row.rsvp_status !== filter) return false;
      if (!needle) return true;

      const haystack = [
        `${row.first_name} ${row.last_name}`,
        ...guestNames(row.additional_guests),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });

    return [...filtered].sort((a, b) => {
      const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "desc" ? -delta : delta;
    });
  }, [rows, query, filter, sort]);

  const totalCards: { label: string; value: number; primary?: boolean }[] = [
    { label: "Total responses", value: totals.responses },
    { label: "Attending", value: totals.attendingMainGuests },
    { label: "Additional attendees", value: totals.additionalAttendees },
    { label: "Expected headcount", value: totals.expectedHeadcount, primary: true },
    { label: "Declined", value: totals.declined },
  ];

  return (
    <>
      <section aria-label="Totals">
        <dl className={styles.totals}>
          {totalCards.map((card) => (
            <div
              key={card.label}
              className={`${styles.total} ${card.primary ? styles.totalPrimary : ""}`}
            >
              <dt className={styles.totalLabel}>{card.label}</dt>
              <dd className={styles.totalValue}>{loading ? "—" : card.value}</dd>
            </div>
          ))}
          <div className={styles.total}>
            <dt className={styles.totalLabel}>Last updated</dt>
            <dd className={styles.totalValue} style={{ fontSize: "var(--step-1)" }}>
              {formatClock(lastUpdated)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Filters" className={styles.controls}>
        <div className={styles.control}>
          <label className={styles.controlLabel} htmlFor="guest-search">
            Search by name
          </label>
          <input
            id="guest-search"
            type="search"
            className={styles.search}
            value={query}
            placeholder="Any guest"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className={styles.control}>
          <span className={styles.controlLabel} id="filter-label">
            Response
          </span>
          <div className={styles.segmented} role="group" aria-labelledby="filter-label">
            {(
              [
                ["all", "All"],
                ["attending", "Attending"],
                ["declined", "Declined"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={styles.segment}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonQuiet}`}
            onClick={() => void load("refresh")}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <a className={styles.button} href="/api/admin/export" download>
            Export CSV
          </a>
        </div>
      </section>

      <p className={styles.meta}>
        <span>
          <span className={styles.liveDot} aria-hidden="true" />
          Updating every 10 seconds
        </span>
        <span>
          Showing {visible.length} of {rows.length}
        </span>
      </p>

      {/* Announce refreshed counts without stealing focus. */}
      <p aria-live="polite" aria-atomic="true" className="visually-hidden">
        {loading
          ? "Loading the guest list."
          : `${visible.length} responses shown. Expected headcount ${totals.expectedHeadcount}.`}
      </p>

      <section className={styles.tableWrap} aria-label="Guest list">
        {error ? (
          <div className={`${styles.state} ${styles.stateError}`} role="alert">
            <p className={styles.stateTitle}>The guest list could not be loaded.</p>
            <p className={styles.stateBody}>{error}</p>
            <p style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className={styles.button}
                onClick={() => void load("refresh")}
              >
                Try again
              </button>
            </p>
          </div>
        ) : loading ? (
          <div className={styles.state}>
            <p className={styles.stateTitle}>Loading</p>
            <div className={styles.loadingRules} aria-hidden="true">
              <span className={styles.loadingRule} />
              <span className={styles.loadingRule} />
              <span className={styles.loadingRule} />
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.state}>
            <p className={styles.stateTitle}>
              {rows.length === 0 ? "No responses yet." : "Nothing matches that search."}
            </p>
            <p className={styles.stateBody}>
              {rows.length === 0
                ? "Responses will appear here the moment the first guest replies. This list refreshes on its own."
                : "Try a different name, or clear the filters."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className={styles.table}>
              <caption className="visually-hidden">
                Guest responses, sorted by submission time.
              </caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort === "desc" ? "descending" : "ascending"}>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
                    >
                      Submitted
                      <span className={styles.sortCaret} aria-hidden="true">
                        {sort === "desc" ? "↓" : "↑"}
                      </span>
                      <span className="visually-hidden">
                        {sort === "desc"
                          ? ", newest first. Activate to show oldest first."
                          : ", oldest first. Activate to show newest first."}
                      </span>
                    </button>
                  </th>
                  <th scope="col">Guest</th>
                  <th scope="col">Response</th>
                  <th scope="col">Additional attendees</th>
                  <th scope="col">Party</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const names = guestNames(row.additional_guests);
                  return (
                    <tr key={row.id}>
                      <td className={styles.cellTime}>{formatTime(row.created_at)}</td>
                      <td className={styles.cellName}>
                        {row.first_name} {row.last_name}
                      </td>
                      <td>
                        <StatusTag status={row.rsvp_status} />
                      </td>
                      <td className={styles.cellGuests}>
                        {names.length === 0 ? (
                          <span className={styles.none}>—</span>
                        ) : (
                          <span className={styles.guestList}>
                            {names.map((name, i) => (
                              <span key={i}>{name}</span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={styles.cellParty}>{row.party_size}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile records — structured, not a squeezed table */}
            <ul className={styles.records}>
              {visible.map((row) => {
                const names = guestNames(row.additional_guests);
                return (
                  <li key={row.id} className={styles.record}>
                    <div className={styles.recordTop}>
                      <span className={styles.recordName}>
                        {row.first_name} {row.last_name}
                      </span>
                      <StatusTag status={row.rsvp_status} />
                    </div>
                    <div className={styles.recordMeta}>
                      <span>{formatTime(row.created_at)}</span>
                      <span>Party of {row.party_size}</span>
                    </div>
                    {names.length > 0 ? (
                      <p className={styles.recordGuests}>
                        <span className={styles.recordGuestsLabel}>With</span>
                        {names.join(", ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
