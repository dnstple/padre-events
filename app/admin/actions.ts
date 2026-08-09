"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_COOKIE,
  isAdminConfigured,
  issueSession,
  passwordMatches,
} from "@/lib/admin-session";

/**
 * Administrator sign-in and sign-out.
 *
 * Server Actions, which Next.js protects against CSRF by comparing the
 * request's Origin with the Host — no bespoke token plumbing needed. The
 * password is never echoed back and the session cookie is httpOnly.
 */

export type LoginState = { error: string | null };

/** Slows brute force without needing any shared state. */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!isAdminConfigured()) {
    return { error: "Administrator access is not configured." };
  }

  if (!password) {
    return { error: "Enter the password." };
  }

  // A fixed pause on every attempt, so a wrong guess costs the same as a right
  // one and the endpoint is not worth hammering.
  await delay(600);

  if (!passwordMatches(password)) {
    return { error: "That password was not recognised." };
  }

  const session = issueSession();
  if (!session) return { error: "Administrator access is not configured." };

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect("/admin/login");
}
