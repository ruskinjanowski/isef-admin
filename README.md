# isef-admin

Admin web UI for ISEF teacher recruitment. See [CLAUDE.md](CLAUDE.md) for architecture and the
Google Sheets → Postgres sync model.

## Running locally

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables** — create a `.env.local` in the project root:

   ```
   DATABASE_URL=                  # Neon connection string
   BETTER_AUTH_SECRET=            # 32+ char secret
   BETTER_AUTH_URL=http://localhost:3000
   GOOGLE_SERVICE_ACCOUNT_JSON=   # service account key (Sheets + Drive read)
   SOURCE_SHEET_ID=               # read-only candidate sheet
   RESEND_API_KEY=
   ```

3. **Apply database migrations**

   ```bash
   npm run db:migrate
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app runs at [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint
npm run db:generate  # generate a Drizzle migration after editing src/db/schema.ts
npm run db:migrate   # apply migrations to Neon
```
