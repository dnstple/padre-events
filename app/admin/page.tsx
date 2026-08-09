import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { cookies } from "next/headers";

import { eventConfig } from "@/config/event";
import Wordmark from "@/components/Wordmark";
import { ADMIN_COOKIE, isAdminConfigured, verifySession } from "@/lib/admin-session";

import { signOut } from "./actions";
import styles from "./admin.module.css";
import Dashboard from "./Dashboard";

export const metadata: Metadata = {
  title: "Guest list — Padre65 Events",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Dynamic, never statically generated: private RSVP data must not be baked
 * into HTML at build time, and the session has to be verified per request.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
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

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Wordmark className={styles.mark} label="Padre65" />
        <span className={styles.barLabel}>Guest list</span>
        <span className={styles.barSpacer} />
        <form action={signOut}>
          <button type="submit" className={`${styles.button} ${styles.buttonQuiet}`}>
            Sign out
          </button>
        </form>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{eventConfig.name}</h1>
        <p className={styles.subtitle}>
          {eventConfig.dateDisplay} · {eventConfig.venue}
        </p>

        {/* Data is fetched client-side from an authenticated endpoint so that
            no guest name is ever present in this page's initial HTML. */}
        <Dashboard />
      </main>
    </div>
  );
}
