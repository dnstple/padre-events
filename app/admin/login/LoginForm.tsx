"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type LoginState } from "../actions";
import styles from "../admin.module.css";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.loginButton} disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className={styles.loginCard}>
      {state.error ? (
        <p className={styles.loginError} role="alert">
          {state.error}
        </p>
      ) : null}

      <fieldset className={styles.loginFields}>
        <legend className="visually-hidden">Administrator sign in</legend>

        <div className={styles.loginField}>
          <label className={styles.loginLabel} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className={styles.loginInput}
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  );
}
