// Normalising the free-text "WhatsApp Number" form cell into the E.164-without-+
// digits Meta's Cloud API wants. The cell is hand-typed by candidates from many
// countries, so it arrives in every shape: "+27 82 539 4454", "0027…", local
// "082…", Sheets-mangled "825394454" (leading 0 eaten), with spaces/dashes/parens.
//
// A number without a country code is resolved using the candidate's own
// location/nationality as a hint, and only accepted if it is a VALID number for
// that country (libphonenumber's full metadata). What we still can't resolve is
// FLAGGED rather than guessed — we never text a stranger on a hunch.

import { parsePhoneNumberFromString } from "libphonenumber-js/max";

import { countriesIn } from "./country";

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

// Meta accepts E.164 numbers of 8–15 digits (country code + subscriber number).
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/** Digits of `+digits` if libphonenumber says it's a valid international number. */
function validInternational(digits: string): string | null {
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  return parsed?.isValid() ? parsed.number.slice(1) : null;
}

/**
 * Normalise a raw "WhatsApp Number" cell to E.164 digits (no leading "+").
 *
 * `countryHints` are free-text cells naming where the candidate is from / lives
 * (e.g. `[view.location, view.nationality]`), tried in order for numbers typed
 * without a country code.
 *
 * - `"+27 82 539 4454"` / `"0027 82…"` → `"27825394454"` (explicit country code,
 *   trusted as written).
 * - `"082 539 4454"` + hint "Durban, South Africa" → `"27825394454"`.
 * - `"825394454"` (Sheets dropped the 0) + same hint → `"27825394454"`.
 * - `"27825394454"` (international, no "+") → unchanged.
 * - Anything that isn't valid for a hinted country nor as an international
 *   number → flagged, and the UI shows the reason instead of sending.
 */
export function normalizePhone(
  raw: string,
  countryHints: string[] = [],
): PhoneResult {
  // Strip invisible bidi marks etc. that sneak in via copy-paste.
  const trimmed = (raw ?? "").replace(/[‎‏‪-‮]/g, "").trim();
  if (!trimmed) return { ok: false, reason: "no number on file" };

  const hasPlus = /^\(?\+/.test(trimmed);
  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return { ok: false, reason: "no digits in number" };

  // "00" is the international call prefix — same intent as a "+".
  const explicitCode = hasPlus || digits.startsWith("00");
  if (!hasPlus && digits.startsWith("00")) digits = digits.slice(2);

  if (explicitCode) {
    // The candidate told us the country code; trust it as written (Meta is the
    // final judge). Only fix the common "+27 082…" slip of keeping the trunk 0.
    const fixed = validInternational(digits) ?? fixTrunkZero(digits);
    if (fixed) return { ok: true, e164: fixed };
    if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
      return { ok: false, reason: `implausible length (${digits.length} digits)` };
    }
    return { ok: true, e164: digits };
  }

  // No country code written: try it as a national number for each hinted
  // country. parse() also copes with a country code typed without "+"
  // ("966 5…" for a Saudi hint) and a missing trunk 0 ("82…" for ZA).
  const countries = [...new Set(countryHints.flatMap(countriesIn))];
  for (const country of countries) {
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (parsed?.isValid()) return { ok: true, e164: parsed.number.slice(1) };
  }

  // Maybe it's already international, just without the "+" ("27825394454").
  const intl = digits.startsWith("0") ? null : validInternational(digits);
  if (intl) return { ok: true, e164: intl };

  if (digits.startsWith("0")) {
    // "0966 5…" — the "00" international prefix typed with one 0. Only
    // accepted when the country code is one the candidate's hints point to.
    const rest = digits.slice(1);
    const asIntl = validInternational(rest) ?? fixTrunkZero(rest);
    const country = asIntl && parsePhoneNumberFromString(`+${asIntl}`)?.country;
    if (asIntl && country && countries.includes(country)) {
      return { ok: true, e164: asIntl };
    }
    return {
      ok: false,
      reason:
        countries.length > 0
          ? `local format — not a valid ${countries.join("/")} number`
          : "local format — missing country code",
    };
  }
  return { ok: false, reason: "not a valid number — check country code" };
}

/**
 * "+27 082 539 4454" → "27825394454": a trunk 0 kept after the country code.
 * Tries dropping a 0 after a 1–3 digit country code; null if none validates.
 */
function fixTrunkZero(digits: string): string | null {
  for (let cc = 1; cc <= 3; cc++) {
    if (digits[cc] !== "0") continue;
    const fixed = validInternational(digits.slice(0, cc) + digits.slice(cc + 1));
    if (fixed) return fixed;
  }
  return null;
}
