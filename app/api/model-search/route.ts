import { NextResponse } from "next/server";

import { emailError, normaliseEmail } from "@/lib/email-rules";
import { nameError, normaliseName } from "@/lib/name-rules";
import { normalisePhone, phoneError } from "@/lib/phone-rules";
import { issueRowToken } from "@/lib/row-token";
import { appendPopupSignup, isPopupSheetConfigured } from "@/lib/sheets";
import { MAX_BODY_BYTES } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registrations from the model-search page at /model-search.
 *
 * Deliberately the same shape as /api/popup, and deliberately writing to the
 * same spreadsheet and the same tab. The two pages capture the same person
 * for the same weekend, and one list with a Source column answers "who is
 * coming" without anybody having to merge two exports by hand. What the
 * model search adds — Instagram, which day, the newsletter tick — lives in
 * columns the pop-up simply leaves empty.
 *
 * Request bodies are never logged: they carry a phone number or an email.
 */

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

type Field = "name" | "email" | "phone" | "instagram";

function problem(status: number, message: string, field?: Field) {
  return NextResponse.json(
    { ok: false, message, errors: field ? { [field]: message } : {} },
    { status, headers: jsonHeaders },
  );
}

/**
 * The three answers the page's radio buttons can produce, mapped to what
 * should appear in the spreadsheet. Anything else is a hand-made request:
 * it is not an error worth failing a registration over, so it is recorded
 * as "Either" and the person still gets in.
 */
const DAYS: Record<string, string> = {
  either: "Either",
  saturday: "Saturday",
  sunday: "Sunday",
};

/**
 * Instagram handles, re-checked rather than trusted.
 *
 * The page normalises what it sends to "@handle", but the page is not where
 * the guarantee can live — anything can post here. Instagram allows letters,
 * digits, full stops and underscores, up to 30 characters. A handle that
 * fails is rejected rather than quietly dropped, because somebody who typed
 * one meant to be contactable on it.
 */
const HANDLE = /^@[A-Za-z0-9._]{1,30}$/;

function instagramError(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const handle = value.trim().startsWith("@") ? value.trim() : `@${value.trim()}`;
  if (!HANDLE.test(handle)) return "That does not look like an Instagram handle.";
  return null;
}

function normaliseInstagram(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return problem(415, "Unsupported content type.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return problem(413, "That request was too large.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return problem(400, "We could not read that request.");
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return problem(413, "That request was too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, "We could not read that request.");
  }

  if (typeof body !== "object" || body === null) {
    return problem(400, "We could not read that request.");
  }

  const payload = body as Record<string, unknown>;

  // Honeypot. Accept silently so bots learn nothing from the response —
  // but never silently to US. A trip discards somebody's registration while
  // telling them they are on the list, and the first version of this page
  // did exactly that to real people: the field was clipped rather than
  // display:none and called "company", so password managers filled it. If
  // this line starts appearing in the logs with plausible names next to it,
  // the trap is eating visitors again.
  if (typeof payload.company === "string" && payload.company.length > 0) {
    console.warn(
      "[model-search] honeypot tripped — registration discarded. If this is a " +
      "real person, the trap is being autofilled and must be changed.",
    );
    return NextResponse.json({ ok: true, token: null }, { status: 200, headers: jsonHeaders });
  }

  const nameMessage = nameError(payload.name);
  if (nameMessage) return problem(422, nameMessage, "name");

  // Exactly one contact detail. The page asks for one or the other, so two is
  // a malformed request rather than a generous visitor.
  const hasEmail = typeof payload.email === "string" && payload.email.trim() !== "";
  const hasPhone = typeof payload.phone === "string" && payload.phone.trim() !== "";

  if (!hasEmail && !hasPhone) {
    return problem(422, "Please give us a mobile number or an email address.");
  }
  if (hasEmail && hasPhone) {
    return problem(422, "Please give us one or the other, not both.");
  }

  let email = "";
  let phone = "";

  if (hasEmail) {
    const message = emailError(payload.email);
    if (message) return problem(422, message, "email");
    email = normaliseEmail(payload.email as string);
  } else {
    const message = phoneError(payload.phone);
    if (message) return problem(422, message, "phone");
    phone = normalisePhone(payload.phone);
  }

  const instagramMessage = instagramError(payload.instagram);
  if (instagramMessage) return problem(422, instagramMessage, "instagram");

  if (!isPopupSheetConfigured()) {
    return problem(503, "Registrations are not available right now.");
  }

  const day = typeof payload.day === "string" ? DAYS[payload.day.toLowerCase()] : undefined;

  let rowNumber: number | null = null;
  try {
    ({ rowNumber } = await appendPopupSignup({
      name: normaliseName(String(payload.name)),
      email,
      phone,
      source: "model-search",
      instagram: normaliseInstagram(payload.instagram),
      day: day ?? "Either",
      // Strictly the boolean. A truthy string like "false" must not become
      // consent, and consent is the only thing that makes mailing them legal.
      newsletter: payload.newsletter === true,
    }));
  } catch (error) {
    console.error(
      "[model-search] append failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return problem(500, "We could not save that. Please try again.");
  }

  // No row number means the append succeeded but Sheets described the result
  // in a shape we did not expect. The registration is safe; only the calendar
  // flag is lost, so this degrades rather than failing the visitor.
  const token = rowNumber === null ? null : issueRowToken(rowNumber, "models");

  return NextResponse.json({ ok: true, token }, { status: 200, headers: jsonHeaders });
}

export async function GET() {
  return problem(405, "Method not allowed.");
}
