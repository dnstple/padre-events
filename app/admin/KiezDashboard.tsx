"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { KiezRow } from "@/lib/kiez-sheets";

import styles from "./admin.module.css";

/* -----------------------------------------------------------------------------
 * Padre65 × Kiez RSVPs. The pop-up dashboard's surface, cut down to what this
 * night records: a name, one contact detail, the calendar flag, and where the
 * guest came from. Rows from the "(test)" tab never reach this screen.
 * -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 10_000;

type Totals = {
  rsvps: number;
  withMobile: number;
  withEmail: number;
  addedToCalendar: number;
  photoDrop: number;
};

type Payload = { ok: boolean; rows: KiezRow[]; totals: Totals; fetchedAt: string; message?: string };

const EMPTY: Totals = { rsvps: 0, withMobile: 0, withEmail: 0, addedToCalendar: 0, photoDrop: 0 };

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

function YesNo({ yes }: { yes: boolean }) {
  return (
    <span className={`${styles.status} ${yes ? styles.statusAttending : styles.statusDeclined}`}>
      <span className={styles.statusGlyph} aria-hidden="true" />
      {yes ? "Yes" : "No"}
    </span>
  );
}

export default function KiezDashboard() {
  const [rows, setRows] = useState<KiezRow[]>([]);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const inFlight = useRef(false);
  const router = useRouter();

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/admin/kiez", {
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
        setError(data?.message ?? "We could not load the RSVPs.");
        return;
      }
      setRows(data.rows);
      setTotals(data.totals);
      setError(null);
    } catch {
      setError("We could not reach the server. Retrying automatically.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.name, row.email, row.phone].join(" ").toLowerCase().includes(needle));
  }, [rows, query]);

  const cards = [
    { label: "RSVPs", value: totals.rsvps, primary: true },
    { label: "Mobile numbers", value: totals.withMobile },
    { label: "Email addresses", value: totals.withEmail },
    { label: "Added to calendar", value: totals.addedToCalendar },
    { label: "Photo drop requests", value: totals.photoDrop },
  ];

  return (
    <>
      <section aria-label="Totals">
        <dl className={styles.totals}>
          {cards.map((card) => (
            <div key={card.label} className={`${styles.total} ${card.primary ? styles.totalPrimary : ""}`}>
              <dt className={styles.totalLabel}>{card.label}</dt>
              <dd className={styles.totalValue}>{loading ? "—" : card.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Filters" className={styles.controls}>
        <div className={styles.control}>
          <label className={styles.controlLabel} htmlFor="kiez-search">
            Search
          </label>
          <input
            id="kiez-search"
            type="search"
            className={styles.search}
            value={query}
            placeholder="Name, number or address"
            onChange={(event) => setQuery(event.target.value)}
          />
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

      <section className={styles.tableWrap} aria-label="Kiez RSVPs">
        {error ? (
          <div className={`${styles.state} ${styles.stateError}`} role="alert">
            <p className={styles.stateTitle}>The RSVPs could not be loaded.</p>
            <p className={styles.stateBody}>{error}</p>
          </div>
        ) : loading ? (
          <div className={styles.state}>
            <p className={styles.stateTitle}>Loading</p>
          </div>
        ) : visible.length === 0 ? (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{rows.length === 0 ? "No RSVPs yet." : "Nothing matches that search."}</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <caption className="visually-hidden">Kiez RSVPs, newest first.</caption>
              <thead>
                <tr>
                  <th scope="col">Submitted</th>
                  <th scope="col">Name</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Email</th>
                  <th scope="col">Calendar</th>
                  <th scope="col">From</th>
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
                      <YesNo yes={Boolean(row.calendar)} />
                    </td>
                    <td>{row.campaign || row.referrer || <span className={styles.none}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className={styles.records}>
              {visible.map((row) => (
                <li key={row.id} className={styles.record}>
                  <div className={styles.recordTop}>
                    <span className={styles.recordName}>{row.name}</span>
                    <YesNo yes={Boolean(row.calendar)} />
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
