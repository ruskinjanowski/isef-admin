// Read/write core for candidate screening (app-state). Pure domain logic — the
// API route is a thin bridge over this. Screening lives in its own table keyed
// to candidates.id, so Sync never touches it (see src/db/CLAUDE.md).

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { screening } from "@/db/schema";
import { recalculateTierForCandidate } from "@/lib/tiering/recalculate";

// Allowed race values for the screening dropdown. Stored as plain text in the
// column; the app constrains the set so the API can't be fed anything off-list.
export const RACE_OPTIONS = [
  "white",
  "coloured",
  "indian",
  "black",
  "other",
] as const;
export type Race = (typeof RACE_OPTIONS)[number];

export type Screening = {
  appearance: number | null;
  race: string | null;
  /** Reasoning for the manual adjustment. */
  notes: string | null;
  /** Manual reviewer override (±) added to the computed tier score. */
  manualAdjustment: number | null;
  updatedAt: string | null;
};

/** Empty screening for a candidate with no row yet. */
const EMPTY: Screening = {
  appearance: null,
  race: null,
  notes: null,
  manualAdjustment: null,
  updatedAt: null,
};

/** Fields a reviewer can submit. */
export type ScreeningInput = {
  appearance: number | null;
  race: string | null;
  notes: string | null;
  manualAdjustment: number | null;
};

/** Fetch a candidate's screening, or empty values if none exists yet. */
export async function getScreening(candidateId: string): Promise<Screening> {
  const [row] = await db
    .select({
      appearance: screening.appearance,
      race: screening.race,
      notes: screening.notes,
      manualAdjustment: screening.manualAdjustment,
      updatedAt: screening.updatedAt,
    })
    .from(screening)
    .where(eq(screening.candidateId, candidateId))
    .limit(1);

  if (!row) return EMPTY;
  return {
    appearance: row.appearance,
    race: row.race,
    notes: row.notes,
    manualAdjustment: row.manualAdjustment,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Validate and clean raw input into a ScreeningInput, or return an error
 * message. Empty strings collapse to null; appearance must be an integer 1–10.
 */
export function parseScreeningInput(
  raw: unknown,
): { ok: true; value: ScreeningInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Expected a screening object." };
  }
  const body = raw as Record<string, unknown>;

  let appearance: number | null = null;
  const a = body.appearance;
  if (a !== null && a !== undefined && a !== "") {
    const n = typeof a === "string" ? Number(a) : a;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) {
      return { ok: false, error: "Appearance must be a whole number from 1 to 10." };
    }
    appearance = n;
  }

  const race = cleanText(body.race);
  if (race !== null && !RACE_OPTIONS.includes(race as Race)) {
    return { ok: false, error: "Race must be one of the allowed options." };
  }

  const notes = cleanText(body.notes);

  let manualAdjustment: number | null = null;
  const m = body.manualAdjustment;
  if (m !== null && m !== undefined && m !== "") {
    const n = typeof m === "string" ? Number(m) : m;
    if (typeof n !== "number" || !Number.isInteger(n) || n < -100 || n > 100) {
      return {
        ok: false,
        error: "Manual adjustment must be a whole number from -100 to 100.",
      };
    }
    manualAdjustment = n;
  }

  return { ok: true, value: { appearance, race, notes, manualAdjustment } };
}

/** Trim a string field; blank becomes null. Non-strings become null. */
function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Upsert a candidate's screening (one row per candidate). Records the reviewer
 * and bumps updatedAt. Returns the saved screening.
 */
export async function saveScreening(
  candidateId: string,
  input: ScreeningInput,
  updatedBy: string,
): Promise<Screening> {
  const now = new Date();
  await db
    .insert(screening)
    .values({
      candidateId,
      appearance: input.appearance,
      race: input.race,
      notes: input.notes,
      manualAdjustment: input.manualAdjustment,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: screening.candidateId,
      set: {
        appearance: input.appearance,
        race: input.race,
        notes: input.notes,
        manualAdjustment: input.manualAdjustment,
        updatedBy,
        updatedAt: now,
      },
    });

  // Keep the derived tier in sync with the screening that drives it — reads the
  // row we just wrote and recomputes from the latest race/appearance/adjustment.
  await recalculateTierForCandidate(candidateId);

  return {
    appearance: input.appearance,
    race: input.race,
    notes: input.notes,
    manualAdjustment: input.manualAdjustment,
    updatedAt: now.toISOString(),
  };
}
