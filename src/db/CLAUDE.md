# Data setup

How the Postgres schema is organised. Read this before adding columns or tables.
The high-level sync story lives in the root `CLAUDE.md`; this file is the
table-level detail.

## Guiding principle: one table, one purpose

The schema is **not** one wide row per candidate. It is a set of focused tables,
each with a single responsibility. The most important split:

- **Registration mirror** — an *exact* copy of the candidate registration form
  data. Holds form data only, no app state.
- **App-state tables** — everything the app itself produces (pipeline status,
  notes, scores, reviews, audit log, …). Each lives in its **own** table, keyed
  back to a candidate. Added incrementally, as in-app features need them.

Why keep them apart:

- The mirror is overwritten on every Sync. If app state shared the table, Sync
  would risk clobbering it. With the split, **Sync physically cannot touch app
  state** — it only writes the mirror.
- Each concern gets the columns/indexes/constraints it actually needs, instead
  of one ever-growing candidate row.

## Tables

### `candidates` — the registration mirror
*(declared in `schema.ts`; this is "the candidate registration table")*

A pure mirror of the source Google Sheet (itself the Google Form responses
export). One row per candidate.

| column           | purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `id`             | app PK (uuid). Foreign keys from app-state tables point here.  |
| `sheet_key`      | **stable key** = trimmed, lowercased email. Unique. Match on this, never row number. |
| `data` (jsonb)   | every mirrored cell, keyed by the sheet's column header. Empty cells omitted. |
| `last_synced_at` | bookkeeping for the Sync.                                      |
| `created_at` / `updated_at` | row timestamps.                                     |

Rules:

- **No app-state columns here.** Ever. (`status`/`notes` used to live here and
  were deliberately removed — see `drizzle/0001_*`.) The sheet's own hand-typed
  `Status` cell is *form data*, so it stays inside `data` like any other cell;
  it is **not** the app's pipeline status.
- `data` holds the form data *exactly*. Normalising/cleaning values is fine, but
  do not drop or reinterpret columns — this table is the faithful copy.
- Written **only** by the import/sync path (`src/lib/candidates/`). Upsert by
  `sheet_key`; never by row number.

### App-state tables

Each in-app feature gets its **own** table, keyed to `candidates.id` (FK), not
to the email, so app state survives if a candidate's email ever changes in the
sheet. Do not reach for a column on `candidates` instead — that breaks the
mirror/app-state split above.

#### `screening` — reviewer screening fields
*(declared in `schema.ts`; logic in `src/lib/screening/`)*

One row per candidate (unique FK), edited in place on the candidate detail page
and upserted. Holds `appearance` (int 1–10, `CHECK`-constrained, nullable),
`race` (text), `notes` (text), plus `updated_by → users.id` and timestamps. Sync
physically cannot touch it.

Future tables (e.g. a pipeline status) follow the same shape:

```
candidate_statuses(id, candidate_id → candidates.id, status, changed_by, changed_at)
```

### `users` / `sessions` / `accounts` / `verifications`
Better Auth tables (`src/lib/auth.ts`). Don't hand-edit; managed by the adapter.

## Import / sync

The CSV import and the future manual Sheets Sync share one core in
`src/lib/candidates/` (pure normalize + upsert; only the reader swaps). It is
**idempotent**: dedupes resubmissions by email (latest `Timestamp` wins),
inserts new candidates, refreshes `data` on existing ones. Because the table is
a pure mirror, re-running is always safe. See `src/lib/candidates/import.ts`.

## Workflow for schema changes

1. Edit `schema.ts`.
2. `npm run db:generate` → review the SQL in `drizzle/`.
3. `npm run db:migrate` to apply to Neon.
