"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PopupRow, PopupTotals } from "@/lib/popup-types";

import styles from "./admin.module.css";

/* -----------------------------------------------------------------------------
 * Popup signups.
 *
 * The same shape of surface as the house-party guest list — authenticated
 * polling, search, a table on desktop and records on a phone — but a different
 * record: one contact detail rather than a party, and a note of whether the
 * visitor took the calendar file.
 * -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 10_000;

type Filter = "all" | "mobile" | "email" | "calendar" | "egg";

type Payload = {
  ok: boolean;
  rows: PopupRow[];
  totals: PopupTotals;
  fetchedAt: string;
  message?: string;
};

const EMPTY_TOTALS: PopupTotals = {
  signups: 0,
  withMobile: 0,
  withEmail: 0,
  addedToCalendar: 0,
  eggSolved: 0,
};

function formatTime(iso: string): string {
  if (!iso) return "—";
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

/** Filled vs hollow square, so the distinction survives without colour. */
function CalendarTag({ taken }: { taken: boolean }) {
  return (
    <span
      className={`${styles.status} ${taken ? styles.statusAttending : styles.statusDeclined}`}
    >
      <span className={styles.statusGlyph} aria-hidden="true" />
      {taken ? "Yes" : "No"}
    </span>
  );
}

export default function PopupDashboard() {
  const [rows, setRows] = useState<PopupRow[]>([]);
  const [totals, setTotals] = useState<PopupTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const inFlight = useRef(false);
  const router = useRouter();

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === "refresh") setRefreshing(true);

    try {
      const response = await fetch("/api/admin/popup", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      const data = (await response.json().catch(() => null)) as Payload | null;

      if (!response.ok || !data?.ok) {
        setError(data?.message ?? "We could not load the signups.");
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

  useEffect(() => {
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (filter === "mobile" && !row.phone) return false;
      if (filter === "email" && !row.email) return false;
      if (filter === "calendar" && !row.calendar) return false;
      if (filter === "egg" && !row.egg) return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, query, filter]);

  const totalCards: { label: string; value: number; primary?: boolean }[] = [
    { label: "Signups", value: totals.signups, primary: true },
    { label: "Mobile numbers", value: totals.withMobile },
    { label: "Email addresses", value: totals.withEmail },
    { label: "Added to calendar", value: totals.addedToCalendar },
    { label: "Easter egg solved", value: totals.eggSolved },
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
          <label className={styles.controlLabel} htmlFor="popup-search">
            Search
          </label>
          <input
            id="popup-search"
            type="search"
            className={styles.search}
            value={query}
            placeholder="Name, number or address"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className={styles.control}>
          <span className={styles.controlLabel} id="popup-filter-label">
            Show
          </span>
          <div className={styles.segmented} role="group" aria-labelledby="popup-filter-label">
            {(
              [
                ["all", "All"],
                ["mobile", "Mobile"],
                ["email", "Email"],
                ["calendar", "Calendar"],
                ["egg", "Egg"],
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
          <a className={styles.button} href="/api/admin/export?event=popup" download>
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

      <p aria-live="polite" aria-atomic="true" className="visually-hidden">
        {loading ? "Loading the signups." : `${visible.length} signups shown.`}
      </p>

      <section className={styles.tableWrap} aria-label="Popup signups">
        {error ? (
          <div className={`${styles.state} ${styles.stateError}`} role="alert">
            <p className={styles.stateTitle}>The signups could not be loaded.</p>
            <p className={styles.stateBody}>{error}</p>
            <p style={{ marginTop: "1rem" }}>
              <button type="button" className={styles.button} onClick={() => void load("refresh")}>
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
              {rows.length === 0 ? "No signups yet." : "Nothing matches that search."}
            </p>
            <p className={styles.stateBody}>
              {rows.length === 0
                ? "Signups will appear here the moment the first visitor replies. This list refreshes on its own."
                : "Try a different name, or clear the filters."}
            </p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <caption className="visually-hidden">
                Popup signups, newest first.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Submitted</th>
                  <th scope="col">Name</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Email</th>
                  <th scope="col">Calendar</th>
                  <th scope="col">Egg</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.cellTime}>{formatTime(row.created_at)}</td>
                    <td className={styles.cellName}>{row.name}</td>
                    <td>{row.phone || <span className={styles.none}>—</span>}</td>
                    <td>{row.email || <span className={styles.none}>—</span>}</td>
                    <td>
                      <CalendarTag taken={Boolean(row.calendar)} />
                    </td>
                    <td>
                      <CalendarTag taken={row.egg} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile records — structured, not a squeezed table */}
            <ul className={styles.records}>
              {visible.map((row) => (
                <li key={row.id} className={styles.record}>
                  <div className={styles.recordTop}>
                    <span className={styles.recordName}>{row.name}</span>
                    <CalendarTag taken={Boolean(row.calendar)} />
                  </div>
                  <div className={styles.recordMeta}>
                    <span>{formatTime(row.created_at)}</span>
                    <span>{row.phone || row.email}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
