# ISEF Admin

Admin web UI for managing teacher recruitment. ~1000 candidates, each with 20–30 fields
(personal data, CV, photo, and various pipeline statuses).

## Source of truth

The candidate data currently lives in **Google Sheets** and the client is not ready to move
off it yet. The app therefore treats Sheets as an external system of record:

- **Source sheet** — humans edit this by hand. The app has **read-only** access. This is the
  only Google Sheet the app touches. There is no output sheet.
- **Postgres (Neon)** — the app's working store. Holds a cached mirror of the candidate rows
  *plus* all app-only state (auth, statuses, scores, notes, audit log, derived fields).
  Nothing is written back to Google. Synced from the source sheet **manually**, on a
  user-triggered button (see below). Candidates are matched by a **stable key column**
  (candidate ID or email), never by row number — rows move when humans sort/insert.

### Sync

- **Direction**: one-way only, source sheet → Postgres. The app never writes to Sheets.
- **Trigger**: a manual "Sync" button in the UI. No schedule/cron. Runs occasionally.
- Upsert by stable key: insert new candidates, update changed cells, leave app-only columns
  (status, notes, etc.) untouched. ~1000 rows is small enough to sync in a single request.

CVs and photos are **Google Drive links** in the sheet, not cell data; fetched via the same
service account.

## Tech stack (mirrors the `communifi` project next door)

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **DB**: Neon Postgres via `@neondatabase/serverless`
- **ORM**: Drizzle (`src/db/schema.ts`, `drizzle.config.ts`)
- **Auth**: Better Auth, Drizzle adapter (`src/lib/auth.ts`). Email + password to start;
  Google social login is trivial to add later but intentionally off for now.
- **Google Sheets/Drive**: service account (JSON key), no per-user OAuth. Source sheet shared
  with the service account as **Viewer** (read-only).
- **File storage**: Vercel Blob (only if we ever mirror Drive files locally; not needed if we
  just link out to Drive)
- **UI**: shadcn/ui (Radix) + Tailwind 4
- **Email**: Resend
- **Hosting**: Vercel

## Commands

```bash
npm run dev          # local dev server
npm run build
npm run db:generate  # generate Drizzle migration after schema change
npm run db:migrate   # apply migrations to Neon
```

## Environment variables

```
DATABASE_URL=                  # Neon connection string
BETTER_AUTH_SECRET=            # 32+ char secret
BETTER_AUTH_URL=               # base URL
GOOGLE_SERVICE_ACCOUNT_JSON=   # service account key (Sheets + Drive read)
SOURCE_SHEET_ID=               # read-only candidate sheet
RESEND_API_KEY=
```

## Status

Greenfield — repo currently holds only README + this file. Not yet scaffolded.
