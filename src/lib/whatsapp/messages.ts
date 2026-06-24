// Domain layer for WhatsApp messaging: the ONLY thing the UI bridge calls. It
// orchestrates the registry (templates.ts), the HTTP boundary (client.ts), phone
// normalisation (phone.ts) and the DB log (`wa_messages`). client.ts is never
// called from the UI directly. See src/lib/whatsapp/CLAUDE.md.

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { candidates, waMessages } from "@/db/schema";
import { toCandidateView, type CandidateView } from "@/lib/candidates/view";
import { sendTemplate } from "./client";
import { normalizePhone } from "./phone";
import { getTemplate, renderBody } from "./templates";
import { WhatsAppApiError } from "./types";

/** Per-candidate result of a (bulk) send, in the order requested. */
export type SendOutcome = {
  candidateId: string;
  candidateName: string;
  status: "sent" | "failed";
  /** Failure reason (bad number or Meta error); absent on success. */
  error?: string;
  /** Meta's wa_message_id on success. */
  waMessageId?: string;
};

/**
 * Send one approved template to many candidates and log every attempt to
 * `wa_messages`. Runs sequentially — ~100 sends is small, and one-at-a-time
 * keeps us well under Meta's throughput limits and yields a clean per-row
 * outcome. Each attempt is logged (including failures) so the log is the full
 * audit trail. Never throws for a single bad send; the failure lands in the
 * returned outcome and the log row.
 */
export async function sendTemplateToCandidates(
  candidateIds: string[],
  templateKey: string,
  sentBy: string | null,
): Promise<SendOutcome[]> {
  const template = getTemplate(templateKey);
  if (!template) {
    throw new Error(`Unknown WhatsApp template "${templateKey}"`);
  }

  // Load every candidate in one query; preserve the requested order on output.
  const rows = await db
    .select({ id: candidates.id, data: candidates.data })
    .from(candidates)
    .where(inArray(candidates.id, candidateIds));
  const byId = new Map(
    rows.map((r) => [
      r.id,
      toCandidateView({ id: r.id, data: r.data as Record<string, string> }),
    ]),
  );

  const outcomes: SendOutcome[] = [];
  for (const id of candidateIds) {
    const view = byId.get(id);
    if (!view) {
      outcomes.push({
        candidateId: id,
        candidateName: "(unknown)",
        status: "failed",
        error: "candidate not found",
      });
      continue;
    }
    outcomes.push(await sendOne(view, template.key, sentBy));
  }
  return outcomes;
}

/** Resolve, log, send and reconcile a single candidate. Internal. */
async function sendOne(
  view: CandidateView,
  templateKey: string,
  sentBy: string | null,
): Promise<SendOutcome> {
  const template = getTemplate(templateKey)!;
  const phone = normalizePhone(view.contact);
  const body = renderBody(template, view);

  // Log the attempt up front so a crash mid-send still leaves a trace. A bad
  // number never reaches Meta — record it failed and move on.
  const [logged] = await db
    .insert(waMessages)
    .values({
      candidateId: view.id,
      direction: "out",
      type: "template",
      templateName: template.key,
      body,
      status: phone.ok ? "queued" : "failed",
      error: phone.ok ? null : phone.reason,
      sentBy,
    })
    .returning({ id: waMessages.id });

  if (!phone.ok) {
    return {
      candidateId: view.id,
      candidateName: view.fullName,
      status: "failed",
      error: phone.reason,
    };
  }

  try {
    const { waMessageId } = await sendTemplate({
      to: phone.e164,
      templateName: template.name,
      languageCode: template.languageCode,
      params: template.resolveParams(view),
    });
    await db
      .update(waMessages)
      .set({ status: "sent", waMessageId, updatedAt: new Date() })
      .where(eq(waMessages.id, logged.id));
    return {
      candidateId: view.id,
      candidateName: view.fullName,
      status: "sent",
      waMessageId,
    };
  } catch (err) {
    const message =
      err instanceof WhatsAppApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "unknown send error";
    await db
      .update(waMessages)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(waMessages.id, logged.id));
    return {
      candidateId: view.id,
      candidateName: view.fullName,
      status: "failed",
      error: message,
    };
  }
}

/** A logged message joined with its candidate's display name, for the log UI. */
export type MessageLogItem = {
  id: string;
  candidateId: string;
  candidateName: string;
  templateName: string | null;
  body: string | null;
  status: string;
  error: string | null;
  createdAt: Date;
};

/** Most-recent-first slice of the outbound/inbound log for the dashboard. */
export async function listRecentMessages(limit = 100): Promise<MessageLogItem[]> {
  const rows = await db
    .select({
      id: waMessages.id,
      candidateId: waMessages.candidateId,
      data: candidates.data,
      templateName: waMessages.templateName,
      body: waMessages.body,
      status: waMessages.status,
      error: waMessages.error,
      createdAt: waMessages.createdAt,
    })
    .from(waMessages)
    .innerJoin(candidates, eq(waMessages.candidateId, candidates.id))
    .orderBy(desc(waMessages.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    candidateName: toCandidateView({
      id: r.candidateId,
      data: r.data as Record<string, string>,
    }).fullName,
    templateName: r.templateName,
    body: r.body,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt,
  }));
}
