// Pure normalization for candidate rows coming out of the source sheet (CSV
// today, the Sheets API later). No DB, no React, no Next — just data in, data
// out — so it stays trivially testable and reusable by the future Sync.
//
// The source is a Google Form responses export: there is no candidate ID, the
// stable key is the email, and people resubmit the form, so the same email can
// appear on several rows. See CLAUDE.md → "Sync" and the schema comment on
// `candidates`.

/** Header of the column used as the stable key (lowercased email). */
export const EMAIL_COLUMN = "Email Address";
/** Form submission time — used to pick the latest row when an email repeats. */
export const TIMESTAMP_COLUMN = "Timestamp";

/** A raw row as parsed from the CSV: column header → cell value. */
export type RawRow = Record<string, string>;

/** A row normalized into the shape the `candidates` table stores. */
export type NormalizedCandidate = {
  /** Stable key: trimmed, lowercased email. */
  sheetKey: string;
  /** Every mirrored cell, keyed by column header (empty cells dropped). */
  data: Record<string, string>;
  /** Parsed submission time in epoch ms, or null when unparseable. */
  timestampMs: number | null;
};

/**
 * Parse a Google Forms timestamp like "6/22/2025 20:55:11" (M/D/YYYY H:M:S,
 * sheet-local time). Returns epoch ms, or null if it doesn't match. Parsed by
 * hand rather than `new Date(string)` to avoid locale-dependent M/D vs D/M
 * ambiguity.
 */
export function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const match = value
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, mo, d, y, h, mi, s] = match.map(Number);
  const ms = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Normalize one raw CSV row. Returns null when the row has no email — there is
 * no stable key to store it under, so the caller records it as skipped.
 */
export function normalizeRow(raw: RawRow): NormalizedCandidate | null {
  const sheetKey = (raw[EMAIL_COLUMN] ?? "").trim().toLowerCase();
  if (!sheetKey) return null;

  // Mirror every non-empty cell faithfully, trimmed, keyed by header. The
  // sheet's hand-typed "Status" cell is just another mirrored cell here; app
  // pipeline status lives in a separate table (see src/db/CLAUDE.md).
  const data: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const trimmed = (value ?? "").trim();
    if (trimmed) data[header] = trimmed;
  }

  return {
    sheetKey,
    data,
    timestampMs: parseTimestamp(raw[TIMESTAMP_COLUMN]),
  };
}

export type DedupeResult = {
  /** One row per email — the most recent submission. */
  deduped: NormalizedCandidate[];
  /** How many rows were dropped as older duplicates. */
  duplicatesDropped: number;
};

/**
 * Collapse repeated emails to a single candidate, keeping the latest submission
 * (by timestamp). A row with a parseable timestamp always beats one without;
 * ties keep the row seen first. Input order is otherwise preserved.
 */
export function dedupeLatestByEmail(
  rows: NormalizedCandidate[],
): DedupeResult {
  const winners = new Map<string, NormalizedCandidate>();
  let duplicatesDropped = 0;

  for (const row of rows) {
    const current = winners.get(row.sheetKey);
    if (!current) {
      winners.set(row.sheetKey, row);
      continue;
    }
    duplicatesDropped++;
    // Treat a missing timestamp as -Infinity so any dated row wins.
    const incoming = row.timestampMs ?? Number.NEGATIVE_INFINITY;
    const existing = current.timestampMs ?? Number.NEGATIVE_INFINITY;
    if (incoming > existing) winners.set(row.sheetKey, row);
  }

  return { deduped: [...winners.values()], duplicatesDropped };
}
