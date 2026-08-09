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
 * There is no registration link and no password-reset self-service: accounts
 * are created by hand in Supabase and allow-listed via ADMIN_EMAILS.
 */
export default function AdminLoginPage() {
  return (
    <main className={styles.loginShell} data-surface="dark">
      <div className={styles.loginCard}>
        <Wordmark className={styles.loginMark} label="Padre65" />
        <h1 className={styles.loginTitle}>Guest list</h1>
        <LoginForm />
        <p className={styles.loginNote}>
          Administrator accounts are created in Supabase. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
