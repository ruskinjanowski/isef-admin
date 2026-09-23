// Free-text "Current Location" / "Nationality" cell → ISO 3166 country codes,
// used only as a HINT for phone numbers typed without a country code (see
// phone.ts). The location cell is hand-typed ("Durban, KZN", "KSA", "Lahore,
// Pakistan", "Phillippines"), so matching is forgiving; a wrong hint is cheap
// because phone.ts only accepts a hinted number that is valid for that country.

import { getCountries, type CountryCode } from "libphonenumber-js/max";

/**
 * Extra spellings on top of the English country names: abbreviations,
 * demonyms, common typos, and South African places (most SA applicants give a
 * city or province rather than the country).
 */
const ALIASES: Record<string, CountryCode> = {
  uae: "AE",
  emirates: "AE",
  emirati: "AE",
  ksa: "SA",
  saudi: "SA",
  riyadh: "SA",
  jeddah: "SA",
  usa: "US",
  "united states of america": "US",
  america: "US",
  american: "US",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  british: "GB",
  turkey: "TR",
  swaziland: "SZ",
  burma: "MM",
  "ivory coast": "CI",
  korea: "KR",
  pakistani: "PK",
  egyptian: "EG",
  indian: "IN",
  filipino: "PH",
  philippine: "PH",
  phillippines: "PH",
  manila: "PH",
  tunisian: "TN",
  tunis: "TN",
  nigerian: "NG",
  moroco: "MA",
  moroccan: "MA",
  algerian: "DZ",
  jordanian: "JO",
  kenyan: "KE",
  nairobi: "KE",
  ghanaian: "GH",
  lebanese: "LB",
  kyrgyztan: "KG",
  hanoi: "VN",
  // South Africa: cities, provinces and shorthand.
  "south african": "ZA",
  rsa: "ZA",
  durban: "ZA",
  "cape town": "ZA",
  johannesburg: "ZA",
  pretoria: "ZA",
  "port elizabeth": "ZA",
  pietermaritzburg: "ZA",
  "east london": "ZA",
  bloemfontein: "ZA",
  polokwane: "ZA",
  nelspruit: "ZA",
  witbank: "ZA",
  rustenburg: "ZA",
  kzn: "ZA",
  kwazulu: "ZA",
  "kwa zulu": "ZA",
  mpumalanga: "ZA",
  limpopo: "ZA",
  gauteng: "ZA",
  "eastern cape": "ZA",
  "western cape": "ZA",
  "northern cape": "ZA",
  "free state": "ZA",
  "north west": "ZA",
};

/** Lowercase, strip accents and punctuation, collapse to single-spaced words. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Every searchable name → country, longest first so "south africa" beats "africa"-ish partials. */
const NAMES: [string, CountryCode][] = (() => {
  const display = new Intl.DisplayNames("en", { type: "region" });
  const entries = new Map<string, CountryCode>();
  for (const code of getCountries()) {
    const name = display.of(code);
    if (!name) continue;
    entries.set(normalize(name), code);
    // "Myanmar (Burma)" → also "myanmar"; "Congo - Kinshasa" → also "congo".
    const short = name.split(/[(\-]/)[0];
    if (short !== name) entries.set(normalize(short), code);
  }
  for (const [alias, code] of Object.entries(ALIASES)) {
    entries.set(normalize(alias), code);
  }
  return [...entries].sort((a, b) => b[0].length - a[0].length);
})();

/**
 * Country codes mentioned in a free-text location/nationality cell, in the
 * order they appear. Whole-word matches only (so "Niger" doesn't match inside
 * "Nigeria", "Oman" not inside "Romania"). Unrecognised text → [].
 */
export function countriesIn(text: string): CountryCode[] {
  let haystack = ` ${normalize(text ?? "")} `;
  const found: { at: number; code: CountryCode }[] = [];
  for (const [name, code] of NAMES) {
    const needle = ` ${name} `;
    const at = haystack.indexOf(needle);
    if (at === -1) continue;
    found.push({ at, code });
    // Blank out the match (same length) so shorter names can't re-match inside it.
    haystack =
      haystack.slice(0, at + 1) +
      " ".repeat(name.length) +
      haystack.slice(at + 1 + name.length);
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.code))];
}
