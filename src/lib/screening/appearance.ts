// Single source of truth for the appearance rating scale. Pure — no DB, no
// React, no server-only imports — so both the client screening form and the
// server-side tiering engine import the *same* definitions and can't drift.
//
// Stored as an ordinal 1–5 (1 = Poor … 5 = Excellent). Storing the ordinal (not
// the label) keeps the "this level or better" list filter a plain numeric
// comparison; humans only ever see the label. Each level also carries the points
// it contributes to the tier score — appearance is one strong signal among
// several, deliberately capped at 30 so it no longer dominates the tier.

export type AppearanceLevel = {
  /** Stored ordinal, 1 (worst) – 5 (best). */
  value: number;
  /** Label shown to reviewers. */
  label: string;
  /** Points this level contributes to the tier score. */
  points: number;
};

// Best → worst (this is the display order; `value` carries the real ordering).
export const APPEARANCE_LEVELS: readonly AppearanceLevel[] = [
  { value: 5, label: "Excellent", points: 30 },
  { value: 4, label: "Good", points: 22 },
  { value: 3, label: "Average", points: 14 },
  { value: 2, label: "Fair", points: 7 },
  { value: 1, label: "Poor", points: 0 },
] as const;

/** Points for a blank/unscored appearance — counted neutrally, ≈ Average. */
export const APPEARANCE_MISSING_POINTS = 14;

export const APPEARANCE_MIN = 1;
export const APPEARANCE_MAX = 5;

/** Points an ordinal contributes; null/unknown → neutral missing points. */
export function appearancePoints(value: number | null): number {
  if (value == null) return APPEARANCE_MISSING_POINTS;
  return (
    APPEARANCE_LEVELS.find((l) => l.value === value)?.points ??
    APPEARANCE_MISSING_POINTS
  );
}

/** Label for an ordinal, or null when unscored / out of range. */
export function appearanceLabel(value: number | null): string | null {
  if (value == null) return null;
  return APPEARANCE_LEVELS.find((l) => l.value === value)?.label ?? null;
}
