// Throwaway: insert ONE test candidate into the `candidates` mirror so the
// WhatsApp send flow can be exercised end-to-end against a real number you
// control. Idempotent (upsert by the email key), so re-running is safe.
//
//   npx tsx scripts/seed-test-candidate.ts [whatsappNumber] [fullName] [email]
//   defaults: +27825394454 / "Test Candidate" / test.candidate@isef.local
//
// Normally the mirror is written only by the sync path; this is a deliberate
// test artifact. Delete the row when done:
//   delete from candidates where sheet_key = 'test.candidate@isef.local';

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
config({ path: existsSync(envLocal) ? envLocal : resolve(process.cwd(), ".env") });

async function main() {
  const number = process.argv[2] ?? "+27825394454";
  const fullName = process.argv[3] ?? "Test Candidate";
  const email = process.argv[4] ?? "test.candidate@isef.local";
  const sheetKey = email.trim().toLowerCase();

  const { db } = await import("../src/db");
  const { candidates } = await import("../src/db/schema");
  const { sql } = await import("drizzle-orm");

  // Keyed by the source-sheet headers (see src/lib/candidates/view.ts COL). A
  // recent Timestamp sorts it to the top of the newest-first list.
  const data: Record<string, string> = {
    "Full Name": fullName,
    "First Name(s)": fullName.split(" ")[0] ?? fullName,
    "Last Name": fullName.split(" ").slice(1).join(" "),
    "Email Address": email,
    "WhatsApp Number": number,
    "Timestamp": "6/25/2026 12:00:00",
    "Nationality": "Test",
    "Which position are you applying for?": "Test",
  };

  await db
    .insert(candidates)
    .values({ sheetKey, data, lastSyncedAt: new Date() })
    .onConflictDoUpdate({
      target: candidates.sheetKey,
      set: { data, updatedAt: sql`now()` },
    });

  console.log(`✓ Seeded test candidate "${fullName}" <${email}> → ${number}`);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
