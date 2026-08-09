import type { Metadata } from "next";

import Wordmark from "@/components/Wordmark";

import styles from "../admin.module.css";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Padre65 Events",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Administrator sign-in.
 *
 * One shared password, set via the ADMIN_PASSWORD environment variable. There
 * are no user accounts, so there is nothing to register for and nothing to
 * reset — changing the variable and redeploying revokes every session.
 */
export default function AdminLoginPage() {
  return (
    <main className={styles.loginShell} data-surface="dark">
      <div className={styles.loginCard}>
        <Wordmark className={styles.loginMark} label="Padre65" />
        <h1 className={styles.loginTitle}>Guest list</h1>
        <LoginForm />
        <p className={styles.loginNote}>
          Private. Enter the organiser password to view the guest list.
        </p>
      </div>
    </main>
  );
}
