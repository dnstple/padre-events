/**
 * Normalises whatever ended up in GOOGLE_PRIVATE_KEY into a usable PEM.
 *
 * The value has to survive a JSON file, a copy-paste, a shell, a dashboard text
 * box and a build pipeline, and each of those mangles it differently. Every
 * mangling produces the same opaque message from OpenSSL —
 * `error:1E08010C:DECODER routines::unsupported` — which says nothing about
 * which one happened.
 *
 * Rather than document the one true format and let everyone hit that error
 * once, this reconstructs the key from whatever survived. A PEM is only a
 * header, a base64 body and a footer; if those three are recoverable, the
 * original formatting does not matter.
 *
 * Plain JavaScript on purpose: the app imports it and so do the helper scripts,
 * which run under bare Node with no build step. One implementation, no drift.
 * It touches no Node API, so it is trivially testable.
 */

const BEGIN = /-----BEGIN ([A-Z ]+?)-----/;
const END = /-----END ([A-Z ]+?)-----/;

export class PrivateKeyFormatError extends Error {}

/** Wraps a base64 string at 64 characters, as the PEM spec requires. */
function wrap64(body) {
  const lines = [];
  for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
  return lines.join("\n");
}

/**
 * @param {string | undefined} input
 * @returns {string} a canonical PEM ending in a newline
 */
export function normalisePrivateKey(input) {
  if (!input) {
    throw new PrivateKeyFormatError("GOOGLE_PRIVATE_KEY is not set.");
  }

  let value = input.trim();

  // Someone pasted the whole service-account JSON file rather than one field.
  if (value.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new PrivateKeyFormatError("GOOGLE_PRIVATE_KEY starts with { but is not valid JSON.");
    }
    if (typeof parsed?.private_key !== "string") {
      throw new PrivateKeyFormatError(
        "GOOGLE_PRIVATE_KEY looks like the whole JSON key file, but it has no private_key field.",
      );
    }
    value = parsed.private_key.trim();
  }

  // Shell-style quoting that the dashboard kept as literal characters. Only
  // strip a genuinely matching pair, so a stray quote inside stays visible.
  for (const quote of ['"', "'"]) {
    if (value.length > 1 && value.startsWith(quote) && value.endsWith(quote)) {
      value = value.slice(1, -1).trim();
      break;
    }
  }

  // Escaped newlines, which is how the value has to travel through a .env file.
  value = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");

  const begin = value.match(BEGIN);
  const end = value.match(END);

  if (!begin || !end) {
    throw new PrivateKeyFormatError(
      "GOOGLE_PRIVATE_KEY does not contain a -----BEGIN PRIVATE KEY----- block. Copy the whole " +
        "private_key value from the service-account JSON, including the BEGIN and END lines.",
    );
  }

  if (begin[1] !== end[1]) {
    throw new PrivateKeyFormatError(
      `GOOGLE_PRIVATE_KEY begins as "${begin[1]}" but ends as "${end[1]}" — it has been truncated or spliced.`,
    );
  }

  const label = begin[1];

  // Everything between the markers, with every kind of whitespace removed. This
  // is what rescues a key whose newlines became spaces, or vanished entirely.
  const body = value
    .slice(value.indexOf(begin[0]) + begin[0].length, value.indexOf(end[0]))
    .replace(/\s+/g, "");

  if (!body) {
    throw new PrivateKeyFormatError("GOOGLE_PRIVATE_KEY has BEGIN and END lines but nothing between them.");
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new PrivateKeyFormatError(
      "The body of GOOGLE_PRIVATE_KEY contains characters that are not valid base64. It was " +
        "probably altered in transit — copy it again from the JSON file.",
    );
  }

  return `-----BEGIN ${label}-----\n${wrap64(body)}\n-----END ${label}-----\n`;
}
