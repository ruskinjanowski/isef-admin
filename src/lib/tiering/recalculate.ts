// Bulk tier recalculation — the "Recalculate all tiers" job. Reads every
// candidate that has a screening row, runs the pure engine (./tiering), and
// writes the derived tier + score back into that screening row. App-state only,
// so Sync never touches it (see src/db/CLAUDE.md).
//
// Tier lives on `screening`, and the engine needs a race (reviewer-entered), so
// only screened candidates can be tiered. Unscreened candidates have no row and
// are simply Unranked in the UI — we do NOT create empty rows for them.

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidates, screening } from "@/db/schema";
import { computeTier, toTierInputs } from "./tiering";

export type RecalcSummary = {
  /** Candidates in the table overall. */
  candidatesTotal: number;
  /** Screening rows recomputed this run. */
  screened: number;
  tier1: number;
  tier2: number;
  tier3: number;
  /** Screened but no race recorded → tier cleared to null. */
  unrankedScreened: number;
  /** Candidates with no screening row at all (also Unranked in the UI). */
  notScreened: number;
};

/** Recompute and persist tiers for all screened candidates. */
export async function recalculateAllTiers(): Promise<RecalcSummary> {
  const [{ n: candidatesTotal }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(candidates);

  // Join the mirror data onto each existing screening row.
  const rows = await db
    .select({
      candidateId: screening.candidateId,
      data: candidates.data,
      race: screening.race,
      appearance: screening.appearance,
      manualAdjustment: screening.manualAdjustment,
    })
    .from(screening)
    .innerJoin(candidates, eq(candidates.id, screening.candidateId));

  const now = new Date();
  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;
  let unrankedScreened = 0;

  for (const r of rows) {
    const result = computeTier(
      toTierInputs(r.data as Record<string, string>, {
        race: r.race,
        appearance: r.appearance,
        manualAdjustment: r.manualAdjustment,
      }),
    );

    await db
      .update(screening)
      .set({
        tier: result.tier,
        tierScore: result.score,
        tierComputedAt: now,
      })
      .where(eq(screening.candidateId, r.candidateId));

    if (result.tier === 1) tier1++;
    else if (result.tier === 2) tier2++;
    else if (result.tier === 3) tier3++;
    else unrankedScreened++;
  }

  return {
    candidatesTotal,
    screened: rows.length,
    tier1,
    tier2,
    tier3,
    unrankedScreened,
    notScreened: candidatesTotal - rows.length,
  };
}

/**
 * Recompute and persist the tier for a single candidate. Reads the just-saved
 * screening row back (so it reflects the latest race/appearance/adjustment),
 * computes, and writes the tier fields. No-op if the candidate has no screening
 * row. Called after a screening save so tiers stay in sync without a full
 * recalculation.
 */
export async function recalculateTierForCandidate(
  candidateId: string,
): Promise<void> {
  const [row] = await db
    .select({
      data: candidates.data,
      race: screening.race,
      appearance: screening.appearance,
      manualAdjustment: screening.manualAdjustment,
    })
    .from(screening)
    .innerJoin(candidates, eq(candidates.id, screening.candidateId))
    .where(eq(screening.candidateId, candidateId))
    .limit(1);

  if (!row) return;

  const result = computeTier(
    toTierInputs(row.data as Record<string, string>, {
      race: row.race,
      appearance: row.appearance,
      manualAdjustment: row.manualAdjustment,
    }),
  );

  await db
    .update(screening)
    .set({
      tier: result.tier,
      tierScore: result.score,
      tierComputedAt: new Date(),
    })
    .where(eq(screening.candidateId, candidateId));
}
