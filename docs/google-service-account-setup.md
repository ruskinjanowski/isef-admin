# Google Service Account — read-only Sheets access

> Hand-off note: this doc is self-contained so it can be followed in a fresh chat with no
> prior context. It sets up the credentials the ISEF Admin app uses to read the candidate
> Google Sheet.

## What we're trying to achieve

The ISEF Admin app needs to **read** a Google Sheet of ~1000 teacher-recruitment candidates
(the client's system of record). The app reads it one-way and caches it into Postgres; it
never writes back to Google.

For a server app the clean way to do this is a **service account** — a non-human Google
identity with its own email and a JSON key. The app authenticates *as the service account*
(no per-user Google login, no OAuth consent screen). We then **share the sheet with that
service account's email as Viewer**, so read-only is enforced by Google itself, not just by
our code.

End state we want:

- A service account with a downloaded **JSON key**.
- The **Google Sheets API** (and **Google Drive API**, for CV/photo files) enabled.
- The candidate sheet **shared as Viewer** with the service account email.
- Two values to drop into the app's `.env`:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` — the key file contents
  - `SOURCE_SHEET_ID` — the sheet's ID from its URL

## Step-by-step

### 1. Create / pick a Google Cloud project

1. Go to <https://console.cloud.google.com>.
2. Top bar → project dropdown → **New Project** (e.g. name it `isef-admin`). Or reuse an
   existing project.

### 2. Enable the APIs

1. Navigation menu → **APIs & Services → Library**.
2. Search **Google Sheets API** → **Enable**.
3. Search **Google Drive API** → **Enable** (needed to fetch the CV/photo files linked in
   the sheet).

### 3. Create the service account

1. **APIs & Services → Credentials** → **Create credentials → Service account**.
2. Name it e.g. `isef-sheets-reader`. Skip the optional "grant access" steps → **Done**.
3. You'll land on the credentials list. Copy the service account's **email** — it looks like
   `isef-sheets-reader@<project>.iam.gserviceaccount.com`. You'll need it in step 5.

### 4. Create and download a JSON key

1. Click the service account → **Keys** tab → **Add key → Create new key**.
2. Choose **JSON** → **Create**. A `.json` file downloads. **Treat this like a password** —
   it grants access as the service account. Don't commit it to git.

### 5. Share the sheet with the service account

1. Open the candidate Google Sheet in the browser.
2. **Share** → paste the service account email from step 3 → set role to **Viewer** →
   uncheck "Notify people" → **Share**.
3. If the CV/photo files live in a Drive folder, share that folder with the same email as
   **Viewer** too.

### 6. Get the sheet ID

From the sheet URL:

```
https://docs.google.com/spreadsheets/d/THIS_LONG_STRING_IS_THE_ID/edit#gid=0
```

Copy the part between `/d/` and `/edit` — that's `SOURCE_SHEET_ID`.

## Putting it in the app

Add to `.env.local` (and to Vercel project env vars for deploy):

```
SOURCE_SHEET_ID=<the id from step 6>
GOOGLE_SERVICE_ACCOUNT_JSON=<contents of the JSON key file>
```

Notes on the JSON value:

- Easiest robust approach: **base64-encode** the whole JSON file and store that single line,
  then decode it in code. Avoids newline/escaping pain in env files.
  - macOS: `base64 -i service-account.json | pbcopy`
- Or paste the raw JSON as a single-line string (escape the `\n` in `private_key`).

Add the key file and any `.json` credentials to `.gitignore` so they never get committed.

## Security checklist

- [ ] JSON key file is git-ignored and not pasted into chat/commits.
- [ ] Service account has **Viewer** on the sheet, never Editor.
- [ ] No project-level IAM roles granted to the service account — sheet sharing is the only
      access it needs.
- [ ] Key stored as an env var in Vercel (encrypted), not in the repo.

## Hand-off summary for the next chat

> I'm building ISEF Admin (Next.js + Drizzle + Neon Postgres). I've created a Google Cloud
> service account with the Sheets + Drive APIs enabled and shared the candidate sheet with it
> as Viewer. I have the service-account JSON key and the sheet ID in env vars
> (`GOOGLE_SERVICE_ACCOUNT_JSON`, `SOURCE_SHEET_ID`). Help me write the read-only Sheets
> client and the manual sync route that upserts rows into Postgres.
