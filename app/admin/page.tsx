import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { eventConfig } from "@/config/event";
import Wordmark from "@/components/Wordmark";
import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";

import { signOut } from "./actions";
import styles from "./admin.module.css";
import Dashboard from "./Dashboard";
import PopupDashboard from "./PopupDashboard";

export const metadata: Metadata = {
  title: "Responses — Padre65 Events",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Dynamic, never statically generated: private data must not be baked into
 * HTML at build time, and the session has to be verified per request.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Two events, one screen.
 *
 * The choice lives in the URL rather than in component state, so a view can be
 * linked, bookmarked and reloaded — and so the back button does what a nav
 * implies it does.
 */
const EVENTS = [
  {
    key: "popup",
    label: "Popup shop",
    title: "Padre65 — Popup Shop",
    meta: "26–27 September · 353 Portobello Road, London W10 5SA",
  },
  {
    key: "houseparty",
    label: "House party",
    title: eventConfig.name,
    meta: `${eventConfig.dateDisplay} · ${eventConfig.venue}`,
  },
] as const;

type EventKey = (typeof EVENTS)[number]["key"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  if (!isAdminConfigured()) {
    return (
      <main className={styles.loginShell} data-surface="dark">
        <div className={styles.loginCard}>
          <Wordmark className={styles.loginMark} label="Padre65" />
          <h1 className={styles.loginTitle}>Administrator access is not configured.</h1>
          <p className={styles.loginNote}>
            Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in your environment
            variables, then redeploy.
          </p>
        </div>
      </main>
    );
  }

  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  // The popup is the live event, so it is what you land on.
  const requested = (await searchParams).event;
  const active: EventKey = requested === "houseparty" ? "houseparty" : "popup";
  const current = EVENTS.find((e) => e.key === active)!;

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Wordmark className={styles.mark} label="Padre65" />
        <span className={styles.barLabel}>Responses</span>
        <span className={styles.barSpacer} />
        <form action={signOut}>
          <button type="submit" className={`${styles.button} ${styles.buttonQuiet}`}>
            Sign out
          </button>
        </form>
      </header>

      <main className={styles.main}>
        <nav className={styles.eventNav} aria-label="Event">
          {EVENTS.map((event) => (
            <Link
              key={event.key}
              href={event.key === "popup" ? "/admin" : `/admin?event=${event.key}`}
              className={styles.eventTab}
              aria-current={event.key === active ? "page" : undefined}
              prefetch={false}
            >
              {event.label}
            </Link>
          ))}
        </nav>

        <h1 className={styles.title}>{current.title}</h1>
        <p className={styles.subtitle}>{current.meta}</p>

        {/* Data is fetched client-side from an authenticated endpoint so that
            no name is ever present in this page's initial HTML. */}
        {active === "popup" ? <PopupDashboard /> : <Dashboard />}
      </main>
    </div>
  );
}
