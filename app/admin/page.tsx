import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { eventConfig } from "@/config/event";
import Wordmark from "@/components/Wordmark";
import { getAdminSession } from "@/lib/admin-auth";

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
  const auth = await getAdminSession();

  if (!auth.ok) {
    if (auth.reason === "unauthenticated") redirect("/admin/login");

    // Authenticated but not permitted, or ADMIN_EMAILS is unset.
    return (
      <main className={styles.loginShell} data-surface="dark">
        <div className={styles.loginCard}>
          <Wordmark className={styles.loginMark} label="Padre65" />
          <h1 className={styles.loginTitle}>
            {auth.reason === "unconfigured"
              ? "Administrator access is not configured."
              : "This account is not authorised."}
          </h1>
          <p className={styles.loginNote}>
            {auth.reason === "unconfigured"
              ? "Set the ADMIN_EMAILS environment variable to the addresses permitted to view the guest list, then redeploy."
              : "Ask for this address to be added to ADMIN_EMAILS, or sign in with an administrator account."}
          </p>
          <form action={signOut}>
            <button type="submit" className={styles.loginButton}>
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Wordmark className={styles.mark} label="Padre65" />
        <span className={styles.barLabel}>Guest list</span>
        <span className={styles.barSpacer} />
        <span className={styles.barEmail}>{auth.session.email}</span>
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
