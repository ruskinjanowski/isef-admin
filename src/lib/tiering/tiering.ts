// Pure tiering engine. No DB, no React, no Next — candidate data in, score out —
// so it stays trivially testable and is reused by both the bulk recalculation
// (src/lib/tiering/recalculate.ts) and the per-candidate breakdown page.
//
// WHAT THIS IS: a heuristic *approximation* of the recruiter's tier rules, not a
// faithful reproduction of them. By decision, the score is purely ADDITIVE —
// there are NO hard gates — so a high appearance can outweigh a missing degree
// or a short tenure, and a non-white candidate with a strong profile but only
// 4–5 years can still land Tier 1 even though the strict rule would say Tier 2.
// That tradeoff is accepted; the breakdown page makes any such case visible.
//
// Every weight lives in WEIGHTS below — tune there, never in the logic. If a
// criterion ever needs to become a hard gate (cap the tier rather than add
// points), do it where that component is added in computeTier.
//
// The whole model branches on RACE, which is reviewer-entered screening data.
// A candidate with no race recorded cannot be tiered → Unranked.

import { COL, parseYears } from "@/lib/candidates/view";

// ─── Tunable model ───────────────────────────────────────────────────────────

const WEIGHTS = {
  // Appearance band → points. Appearance is the dominant tier signal. A blank
  // score is treated as neutral (≈ a mid band) and flagged provisional rather
  // than penalised — reviewers may tier on the rest of the profile.
  appearance: { high: 50, mid: 28, low: 12, missing: 28 }, // 7–10 / 4–6 / 1–3 / blank

  // Experience points are race-group aware: the bar for the same points is
  // higher for non-white candidates, mirroring the stricter rule there.
  experience: {
    white: { meets: 15, below: 3 }, //            ≥1yr   / 0yr
    nonwhite: { high: 15, mid: 8, low: 4, below: 0 }, // ≥6 / 4–5 / 2–3 / <2
  },

  // Highest credential found across qualification + certification.
  qualification: { degree: 25, diploma: 6, none: 0 },

  age: { ok: 10, over: 0 }, // ≤45 / >45

  // "Outstanding" criteria — each a small, equal bump, with a combined cap so
  // they refine ranking without dominating. (Curriculum is intentionally absent
  // for v1: there is no structured field to read it from.)
  bonus: { each: 4, cap: 10 },

  ageCutoff: 45,
} as const;

// Score → tier band.
const BANDS = { tier1: 80, tier2: 60 } as const;

// Experience thresholds (years) per group.
const EXP = { whiteMeets: 1, nonwhiteHigh: 6, nonwhiteMid: 4, nonwhiteLow: 2 };

// Nationalities that earn the boost (matched case-insensitively as substrings).
const BOOST_NATIONALITY = [
  "south africa",
  "canad",
  "united states",
  "america",
  "united kingdom",
  "britain",
  "british",
  "england",
  "scotland",
  "wales",
];

// ─── Types ───────────────────────────────────────────────────────────────────

export type RaceGroup = "white" | "nonwhite";

/** A tier, or null when the candidate can't be tiered (not screened). */
export type Tier = 1 | 2 | 3 | null;

/** Everything the engine needs about one candidate. */
export type TierInputs = {
  /** Screening race (white / coloured / indian / black / other), or null. */
  race: string | null;
  /** Screening appearance 1–10, or null if unscored. */
  appearance: number | null;
  /** Years of experience, already parsed, or null. */
  years: number | null;
  /** Raw "Highest Qualification" cell. */
  qualification: string;
  /** Raw "Teaching Certification" cell. */
  certification: string;
  /** Age, already parsed, or null. */
  age: number | null;
  /** Raw nationality cell. */
  nationality: string;
  /** Reviewer's manual score override (±), or null/0 for none. */
  manualAdjustment: number | null;
};

/** One line in the score breakdown, for the breakdown page. */
export type BreakdownLine = { label: string; detail: string; points: number };

export type TierResult = {
  /** 1 / 2 / 3, or null = Unranked (no race recorded). */
  tier: Tier;
  /** 0–100, or null when unranked. */
  score: number | null;
  group: RaceGroup | null;
  /** Per-component contributions, in display order. Empty when unranked. */
  breakdown: BreakdownLine[];
  /** Human-readable caveats (missing appearance, over age, etc.). */
  flags: string[];
};

// ─── Classifiers (exported for the breakdown page + tests) ───────────────────

/** Map a screening race to its scoring group, or null if unscreened. */
export function raceGroup(race: string | null): RaceGroup | null {
  if (!race) return null;
  return race.trim().toLowerCase() === "white" ? "white" : "nonwhite";
}

export type Credential = "degree" | "diploma" | "none";

/**
 * Highest credential implied by the qualification + certification cells. Degree
 * covers bachelor/honours/masters/doctorate and PGCE/QTS/B.Ed (degree-or-PGCE in
 * the rules); diploma covers diplomas, associate degrees and entry teaching
 * certs (TEFL/TESOL/CELTA); everything else is none. Heuristic keyword matching
 * over messy free text — extend the patterns as odd values show up.
 */
export function classifyCredential(
  qualification: string,
  certification: string,
): Credential {
  const s = `${qualification} ${certification}`.toLowerCase();
  // Abbreviations (b.ed, m.a, …) need a leading word boundary too, or the "ma"
  // in "diploma" / "ba" in other words gets misread as an MA/BA degree.
  const degree =
    /(bachelor|honou?rs|master|doctor|phd|dphil|\bpgce|\bpgde|\bqts\b|\bb\.?ed\b|\bb\.?sc\b|\bb\.?a\b|\bm\.?ed\b|\bm\.?sc\b|\bm\.?phil\b|\bm\.?a\b|\bd\.?ed\b|\bdegree\b)/.test(
      s,
    );
  if (degree) return "degree";
  const diplomaOrCert =
    /(diploma|associate|certificate|\bcert\b|tefl|tesol|celta|nqf|abet|montessori|\bhde\b)/.test(
      s,
    );
  return diplomaOrCert ? "diploma" : "none";
}

/** A postgraduate qualification (masters / honours / doctorate). */
export function isPostgrad(qualification: string): boolean {
  return /(master|honou?rs|\bm\.?ed\b|\bm\.?sc\b|\bm\.?phil\b|\bm\.?a\b|doctor|phd|dphil)/.test(
    qualification.toLowerCase(),
  );
}

/** Whether a nationality earns the boost. */
export function hasNationalityBoost(nationality: string): boolean {
  const s = nationality.toLowerCase();
  return BOOST_NATIONALITY.some((n) => s.includes(n));
}

// ─── The engine ──────────────────────────────────────────────────────────────

/** Band 7–10 / 4–6 / 1–3 → "high" / "mid" / "low"; null → "missing". */
function appearanceBand(a: number | null): "high" | "mid" | "low" | "missing" {
  if (a == null) return "missing";
  if (a >= 7) return "high";
  if (a >= 4) return "mid";
  return "low";
}

/** Score one candidate into a tier, with a full breakdown. */
export function computeTier(inputs: TierInputs): TierResult {
  const group = raceGroup(inputs.race);
  if (!group) {
    return {
      tier: null,
      score: null,
      group: null,
      breakdown: [],
      flags: ["Not screened — no race recorded, so no tier can be computed."],
    };
  }

  const lines: BreakdownLine[] = [];
  const flags: string[] = [];

  // 1. Appearance (dominant signal).
  const band = appearanceBand(inputs.appearance);
  lines.push({
    label: "Appearance",
    detail:
      band === "missing"
        ? "no score yet — counted neutrally"
        : `${inputs.appearance}/10 (band ${band === "high" ? "7–10" : band === "mid" ? "4–6" : "1–3"})`,
    points: WEIGHTS.appearance[band],
  });
  if (band === "missing") {
    flags.push("No appearance score — tier is provisional.");
  }

  // 2. Experience (race-group aware).
  const years = inputs.years;
  let expPoints: number;
  let expDetail: string;
  if (group === "white") {
    const meets = years != null && years >= EXP.whiteMeets;
    expPoints = meets ? WEIGHTS.experience.white.meets : WEIGHTS.experience.white.below;
    expDetail = `${years ?? "unknown"} yrs (white: ≥${EXP.whiteMeets} expected)`;
  } else {
    const y = years ?? -1;
    if (y >= EXP.nonwhiteHigh) expPoints = WEIGHTS.experience.nonwhite.high;
    else if (y >= EXP.nonwhiteMid) expPoints = WEIGHTS.experience.nonwhite.mid;
    else if (y >= EXP.nonwhiteLow) expPoints = WEIGHTS.experience.nonwhite.low;
    else expPoints = WEIGHTS.experience.nonwhite.below;
    expDetail = `${years ?? "unknown"} yrs (non-white: ≥${EXP.nonwhiteHigh}=full, ≥${EXP.nonwhiteMid}=part)`;
  }
  if (years == null) flags.push("No parseable experience value.");
  lines.push({ label: "Experience", detail: expDetail, points: expPoints });

  // 3. Qualification / credential.
  const credential = classifyCredential(inputs.qualification, inputs.certification);
  lines.push({
    label: "Qualification",
    detail:
      credential === "degree"
        ? "degree or PGCE"
        : credential === "diploma"
          ? "diploma / teaching certificate (no degree)"
          : "no recognised credential",
    points: WEIGHTS.qualification[credential],
  });

  // 4. Age.
  const overAge = inputs.age != null && inputs.age > WEIGHTS.ageCutoff;
  lines.push({
    label: "Age",
    detail:
      inputs.age == null
        ? "unknown"
        : overAge
          ? `${inputs.age} (over ${WEIGHTS.ageCutoff})`
          : `${inputs.age} (≤${WEIGHTS.ageCutoff})`,
    points: overAge ? WEIGHTS.age.over : WEIGHTS.age.ok,
  });
  if (overAge) flags.push(`Over the age-${WEIGHTS.ageCutoff} preference.`);

  // 5. Outstanding bonuses (small, equal, capped in total).
  const bonuses: BreakdownLine[] = [];
  const addBonus = (label: string, detail: string) =>
    bonuses.push({ label, detail, points: WEIGHTS.bonus.each });
  if (isPostgrad(inputs.qualification)) addBonus("Bonus", "postgraduate qualification");
  if (inputs.years != null && inputs.years >= 10) addBonus("Bonus", "10+ years' experience");
  if (hasNationalityBoost(inputs.nationality))
    addBonus("Bonus", `nationality (${inputs.nationality})`);

  // Apply the combined cap, trimming the last bonus's points if it spills over.
  let bonusTotal = 0;
  for (const b of bonuses) {
    if (bonusTotal >= WEIGHTS.bonus.cap) break;
    const allowed = Math.min(b.points, WEIGHTS.bonus.cap - bonusTotal);
    bonusTotal += allowed;
    lines.push({ ...b, points: allowed });
  }

  // 6. Manual reviewer override (notes hold the reasoning). Applied last so it
  // nudges the final score directly; can push across a band either way.
  if (inputs.manualAdjustment) {
    lines.push({
      label: "Manual adjustment",
      detail: "reviewer override",
      points: inputs.manualAdjustment,
    });
  }

  const raw = lines.reduce((sum, l) => sum + l.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const tier: Tier = score >= BANDS.tier1 ? 1 : score >= BANDS.tier2 ? 2 : 3;

  return { tier, score, group, breakdown: lines, flags };
}

/**
 * Build {@link TierInputs} from a candidate's raw mirror cells plus their
 * screening race/appearance. Kept here (not in the DB layer) so the mapping is
 * pure and shared by recalculation and the breakdown page.
 */
export function toTierInputs(
  data: Record<string, string>,
  screening: {
    race: string | null;
    appearance: number | null;
    manualAdjustment: number | null;
  },
): TierInputs {
  const cell = (k: string) => (data[k] ?? "").trim();
  return {
    race: screening.race,
    appearance: screening.appearance,
    years: parseYears(cell(COL.years)),
    qualification: cell(COL.qualification),
    certification: cell(COL.certification),
    age: parseYears(cell(COL.age)),
    nationality: cell(COL.nationality),
    manualAdjustment: screening.manualAdjustment,
  };
}

/** Label for a tier, for UI. */
export function tierLabel(tier: Tier): string {
  return tier == null ? "Unranked" : `Tier ${tier}`;
}
