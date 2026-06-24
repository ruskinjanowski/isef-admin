// Throwaway: list the message templates on our WABA with their name, language,
// status and category — so the registry in src/lib/whatsapp/templates.ts can be
// matched to what Meta actually approved. Reads only; prints no secrets.
//
//   npx tsx scripts/wa-list-templates.ts

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
config({ path: existsSync(envLocal) ? envLocal : resolve(process.cwd(), ".env") });

async function main() {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!waba || !token) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID / WHATSAPP_ACCESS_TOKEN not set");
  }

  const url = `https://graph.facebook.com/v21.0/${waba}/message_templates?fields=name,language,status,category,components&limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) {
    console.error("✗ API error:", JSON.stringify(json, null, 2));
    process.exit(1);
  }

  type Tpl = {
    name: string;
    language: string;
    status: string;
    category: string;
    components?: { type: string; text?: string }[];
  };
  const templates = (json.data ?? []) as Tpl[];
  if (templates.length === 0) {
    console.log("No templates found on this WABA.");
    return;
  }

  for (const t of templates) {
    console.log("─".repeat(60));
    console.log(`name:     ${t.name}`);
    console.log(`language: ${t.language}`);
    console.log(`status:   ${t.status}`);
    console.log(`category: ${t.category}`);
    const body = t.components?.find((c) => c.type === "BODY");
    if (body?.text) console.log(`body:     ${body.text.replace(/\n/g, "\\n")}`);
  }
  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error("✗ Failed:", err);
  process.exit(1);
});
