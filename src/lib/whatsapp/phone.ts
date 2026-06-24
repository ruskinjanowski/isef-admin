// Normalising the free-text "WhatsApp Number" form cell into the E.164-without-+
// digits Meta's Cloud API wants. The cell is hand-typed by candidates from many
// countries, so it arrives in every shape: "+27 82 539 4454", "0027…", local
// "082…", with spaces/dashes/parens. We normalise conservatively and FLAG what
// we can't resolve rather than guessing a country code and texting a stranger.

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

// Meta accepts E.164 numbers of 8–15 digits (country code + subscriber number).
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Normalise a raw "WhatsApp Number" cell to E.164 digits (no leading "+").
 *
 * - `"+27 82 539 4454"` / `"0027 82…"` → `"27825394454"` (explicit country code).
 * - `"27825394454"` (already international) → unchanged.
 * - `"082 539 4454"` → flagged: a single leading `0` is a national trunk prefix
 *   with no country code, which we refuse to guess (an applicant could be from
 *   anywhere). The UI surfaces these as "needs a country code" instead of sending.
 */
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "no number on file" };

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return { ok: false, reason: "no digits in number" };

  // "00" is the international call prefix — drop it to recover the country code.
  // (Only when not already written with a "+", which is the same intent.)
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!hasPlus && digits.startsWith("0")) {
    // A lone leading 0 is a national format with the country code omitted — we
    // can't know which country, so flag rather than guess.
    return { ok: false, reason: "local format — missing country code" };
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
    return { ok: false, reason: `implausible length (${digits.length} digits)` };
  }

  return { ok: true, e164: digits };
}
