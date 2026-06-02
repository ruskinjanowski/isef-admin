// CSV → Postgres import for candidates. Orchestrates the pure steps in
// ./normalize and upserts into the `candidates` table by stable key.
//
// This is the reusable core the manual Sync button will share: only the reader
// (CSV text here vs. the Sheets API later) changes — normalize, dedupe and
// upsert stay the same. See CLAUDE.md → "Sync".

import { parse } from "csv-parse/sync";
import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidates } from "@/db/schema";
import {
  dedupeLatestByEmail,
  normalizeRow,
  type NormalizedCandidate,
  type RawRow,
} from "./normalize";

export type ImportReport = {
  /** Data rows read from the CSV (excludes the header). */
  totalRows: number;
  /** Rows dropped for having no email (no stable key). */
  skippedNoEmail: number;
  /** Older duplicate submissions collapsed away (latest-wins). */
  duplicatesDropped: number;
  /** Distinct candidates after dedupe (inserted + updated). */
  uniqueCandidates: number;
  /** New candidates created. */
  inserted: number;
  /** Existing candidates whose mirrored cells were refreshed. */
  updated: number;
};

const UPSERT_BATCH_SIZE = 200;

/**
 * Import candidate rows from raw CSV text. Idempotent: inserts new candidates
 * and refreshes the mirrored `data` of existing ones. This table is a pure
 * mirror — it holds no app state, so there is nothing for sync to clobber.
 */
export async function importCandidatesFromCsv(
  csvContent: string,
): Promise<ImportReport> {
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as RawRow[];

  const normalized: NormalizedCandidate[] = [];
  let skippedNoEmail = 0;
  for (const row of rows) {
    const candidate = normalizeRow(row);
    if (candidate) normalized.push(candidate);
    else skippedNoEmail++;
  }

  const { deduped, duplicatesDropped } = dedupeLatestByEmail(normalized);

  // Which keys already exist → lets us report inserted vs. updated accurately,
  // since the upsert itself can't distinguish them.
  const existingKeys = await loadExistingKeys(deduped.map((c) => c.sheetKey));

  let inserted = 0;
  for (const candidate of deduped) {
    if (!existingKeys.has(candidate.sheetKey)) inserted++;
  }

  await upsertCandidates(deduped);

  return {
    totalRows: rows.length,
    skippedNoEmail,
    duplicatesDropped,
    uniqueCandidates: deduped.length,
    inserted,
    updated: deduped.length - inserted,
  };
}

/** Fetch the subset of the given sheet keys that already exist in the table. */
async function loadExistingKeys(keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (keys.length === 0) return found;
  // `inArray` over ~1k keys is one cheap query; chunk to keep the statement
  // comfortably sized.
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const existing = await db
      .select({ sheetKey: candidates.sheetKey })
      .from(candidates)
      .where(inArray(candidates.sheetKey, chunk));
    for (const row of existing) found.add(row.sheetKey);
  }
  return found;
}

/**
 * Upsert candidates in batches. On conflict we refresh the mirrored cells and
 * sync bookkeeping. There are no app-state columns on this table to preserve.
 */
async function upsertCandidates(rows: NormalizedCandidate[]): Promise<void> {
  const now = new Date();
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    await db
      .insert(candidates)
      .values(
        batch.map((c) => ({
          sheetKey: c.sheetKey,
          data: c.data,
          lastSyncedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: candidates.sheetKey,
        set: {
          data: sql`excluded.data`,
          lastSyncedAt: sql`excluded.last_synced_at`,
          updatedAt: sql`now()`,
        },
      });
  }
}
