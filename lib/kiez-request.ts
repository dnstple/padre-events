import "server-only";

import { NextResponse } from "next/server";

import { MAX_BODY_BYTES } from "@/lib/validation";

/**
 * The plumbing the Kiez endpoints share: read a small JSON body safely, a
 * best-effort rate limit, and the two tracking fields cut down to something
 * that cannot carry personal data into the sheet.
 *
 * Request bodies are never logged — they carry a phone number or an email.
 */

export const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export function problem(status: number, message: string, errors: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, message, errors }, { status, headers: jsonHeaders });
}

export async function readJsonBody(
  request: Request,
): Promise<{ payload: Record<string, unknown> } | { error: NextResponse }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { error: problem(415, "Unsupported content type.") };
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: problem(413, "That request was too large.") };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { error: problem(400, "We could not read that request.") };
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { error: problem(413, "That request was too large.") };
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: problem(400, "We could not read that request.") };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: problem(400, "We could not read that request.") };
  }
  return { payload: body as Record<string, unknown> };
}

/* -----------------------------------------------------------------------------
 * Rate limit
 *
 * In memory, per server instance, so it is a speed bump rather than a wall:
 * enough to stop one script hammering the sheet from one address, generous
 * enough that a room of people on the same venue wi-fi never notices it.
 * -------------------------------------------------------------------------- */
const hits = new Map<string, number[]>();

export function rateLimited(request: Request, bucket: string, limit = 20, windowMs = 10 * 60_000) {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return recent.length > limit;
}

/* -----------------------------------------------------------------------------
 * Tracking fields
 *
 * The page sends where the visitor came from so the organiser can see which
 * post or ad worked. Only a host name and UTM values survive, each cut to a
 * safe alphabet — a referrer's path or query could otherwise smuggle an
 * address or a token into the sheet.
 * -------------------------------------------------------------------------- */
const SAFE = /[^A-Za-z0-9 _.\-]/g;

export function cleanReferrer(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).hostname.replace(SAFE, "").slice(0, 80);
  } catch {
    return "";
  }
}

export function cleanCampaign(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const v = value as Record<string, unknown>;
  return ["source", "medium", "campaign", "content"]
    .map((k) => {
      const raw = v[k];
      if (typeof raw !== "string" || !raw.trim()) return "";
      // An @ means somebody has put an address in a UTM. Drop it.
      if (raw.includes("@")) return "";
      return `${k}=${raw.replace(SAFE, "").slice(0, 60)}`;
    })
    .filter(Boolean)
    .join("; ");
}

/** A UUID from the page, or nothing. Never anything else. */
export function cleanRequestId(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : "";
}
