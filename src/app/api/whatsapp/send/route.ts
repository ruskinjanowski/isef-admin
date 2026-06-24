// Auth-guarded bulk send. Thin bridge only — all the Meta/DB/templating work
// lives in src/lib/whatsapp/messages.ts. Admin-only: sends are outward-facing and
// billed per message, so they sit alongside Sync/Users in the privileged tier.

import { authorize } from "@/lib/access";
import { getTemplate } from "@/lib/whatsapp/templates";
import { sendTemplateToCandidates } from "@/lib/whatsapp/messages";

// A bulk send to ~100 recipients hits Meta sequentially; give it room.
export const maxDuration = 60;

type SendBody = { candidateIds?: unknown; templateKey?: unknown };

export async function POST(request: Request) {
  const access = await authorize({ admin: true });
  if (!access.ok) return access.response;

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { candidateIds, templateKey } = body;

  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length === 0 ||
    !candidateIds.every((id) => typeof id === "string")
  ) {
    return Response.json(
      { error: "Select at least one candidate." },
      { status: 400 },
    );
  }
  if (typeof templateKey !== "string" || !getTemplate(templateKey)) {
    return Response.json({ error: "Unknown template." }, { status: 400 });
  }

  try {
    const outcomes = await sendTemplateToCandidates(
      candidateIds,
      templateKey,
      access.user.id,
    );
    const sent = outcomes.filter((o) => o.status === "sent").length;
    const failed = outcomes.length - sent;
    return Response.json({ outcomes, sent, failed });
  } catch (error) {
    console.error("WhatsApp bulk send failed:", error);
    return Response.json({ error: "Could not send messages." }, { status: 500 });
  }
}
