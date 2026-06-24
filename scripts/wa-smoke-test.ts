// Throwaway end-to-end smoke test for the WhatsApp Cloud API send path.
// Sends Meta's pre-approved `hello_world` template (no variables, en_US) to a
// recipient passed on the CLI, proving auth + client.sendTemplate work before
// we build templates.ts and the UI on top.
//
//   npx tsx scripts/wa-smoke-test.ts <recipient-e164-without-plus>
//   e.g. npx tsx scripts/wa-smoke-test.ts 27821234567
//
// Safe to delete once the real welcome template + UI are in place.

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
config({ path: existsSync(envLocal) ? envLocal : resolve(process.cwd(), ".env") });

async function main() {
  const to = process.argv[2]?.replace(/[^\d]/g, "");
  if (!to) {
    console.error(
      "Usage: npx tsx scripts/wa-smoke-test.ts <recipient-e164-without-plus>",
    );
    process.exit(1);
  }

  // Import after env is loaded so client.ts sees the WHATSAPP_* vars.
  const { sendTemplate } = await import("../src/lib/whatsapp/client");

  console.log(`Sending hello_world template to +${to} …`);
  const result = await sendTemplate({
    to,
    templateName: "hello_world",
    languageCode: "en_US",
    params: [],
  });
  console.log("✓ Accepted by Meta. wa_message_id:", result.waMessageId);
}

main().catch((err) => {
  console.error("✗ Send failed:", err);
  process.exit(1);
});
