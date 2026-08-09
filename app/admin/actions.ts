"use server";

import { redirect } from "next/navigation";

import { allowedAdminEmails } from "@/lib/admin-auth";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Administrator sign-in and sign-out.
 *
 * These are Server Actions, which Next.js protects against CSRF by comparing
 * the request's Origin with the Host — so no bespoke token plumbing is needed.
 * The password never touches a client-side Supabase call, and the resulting
 * session cookies are httpOnly, SameSite=Lax and Secure in production.
 */

export type LoginState = { error: string | null };

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const allowed = allowedAdminEmails();

  if (allowed.size === 0) {
    return { error: "Administrator access is not configured. Set ADMIN_EMAILS." };
  }

  // Refuse before touching Supabase if the address is not on the allow-list.
  // The message is deliberately identical to a wrong-password failure so this
  // cannot be used to enumerate which addresses are administrators.
  if (!allowed.has(email)) {
    return { error: "Those details were not recognised." };
  }

  let supabase;
  try {
    supabase = await createSessionClient();
  } catch {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Those details were not recognised." };
  }

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
  } catch {
    // Already signed out, or Supabase unreachable — redirect regardless.
  }
  redirect("/admin/login");
}
