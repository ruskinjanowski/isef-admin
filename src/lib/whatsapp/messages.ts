// Domain layer for WhatsApp messaging: the ONLY thing the UI bridge calls. It
// orchestrates the registry (templates.ts), the HTTP boundary (client.ts), phone
// normalisation (phone.ts) and the DB log (`wa_messages`). client.ts is never
// called from the UI directly. See src/lib/whatsapp/CLAUDE.md.

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { candidates, waConversations, waMessages } from "@/db/schema";
import { toCandidateView, type CandidateView } from "@/lib/candidates/view";
import { sendTemplate } from "./client";
import { normalizePhone } from "./phone";
import { getTemplate, renderBody } from "./templates";
import { WhatsAppApiError } from "./types";

/** Per-candidate result of a (bulk) send, in the order requested. */
export type SendOutcome = {
  candidateId: string;
  candidateName: string;
  /** "skipped" = already sent this template before, so not re-sent. */
  status: "sent" | "failed" | "skipped";
  /** Failure/skip reason (bad number, Meta error, already sent); absent on success. */
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
 *
 * Never double-sends: a candidate who already has a non-failed log row for this
 * template (queued/sent/delivered/read) is skipped and not logged again. Failed
 * attempts don't count, so fixing a bad number and re-sending just works.
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

  // Candidates this template already went out to. "queued" counts too: it's
  // either in flight or crashed mid-send, and Meta may have accepted it.
  const already = new Set(
    (
      await db
        .select({ candidateId: waMessages.candidateId })
        .from(waMessages)
        .where(
          and(
            inArray(waMessages.candidateId, candidateIds),
            eq(waMessages.direction, "out"),
            eq(waMessages.templateName, template.key),
            ne(waMessages.status, "failed"),
          ),
        )
    ).map((r) => r.candidateId),
  );

  const outcomes: SendOutcome[] = [];
  for (const id of new Set(candidateIds)) {
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
    if (already.has(id)) {
      outcomes.push({
        candidateId: id,
        candidateName: view.fullName,
        status: "skipped",
        error: `already sent "${template.key}"`,
      });
      continue;
    }
    outcomes.push(await sendOne(view, template.key, sentBy));
  }
  return outcomes;
}

/**
 * Upsert the phone-keyed conversation for an outbound send, linking it to the
 * candidate. Doesn't touch `windowExpiresAt`/`lastInboundAt` — those track the
 * 24h customer-service window off the contact's *inbound* messages, which an
 * outbound template send isn't.
 */
async function upsertConversationForSend(
  waPhone: string,
  candidateId: string,
): Promise<string> {
  const [conversation] = await db
    .insert(waConversations)
    .values({ waPhone, candidateId })
    .onConflictDoUpdate({
      target: waConversations.waPhone,
      set: { candidateId, updatedAt: new Date() },
    })
    .returning({ id: waConversations.id });
  return conversation.id;
}

/** Resolve, log, send and reconcile a single candidate. Internal. */
async function sendOne(
  view: CandidateView,
  templateKey: string,
  sentBy: string | null,
): Promise<SendOutcome> {
  const template = getTemplate(templateKey)!;
  const phone = normalizePhone(view.contact, [view.location, view.nationality]);
  const body = renderBody(template, view);

  // Thread the send into the same phone-keyed conversation inbound replies
  // use, so the Conversations UI is the one place to see everything — a
  // template send and any reply live in the same thread. Only when the
  // number resolves; a bad number never reaches Meta or gets a conversation.
  const conversationId = phone.ok
    ? await upsertConversationForSend(phone.e164, view.id)
    : null;

  // Log the attempt up front so a crash mid-send still leaves a trace. A bad
  // number never reaches Meta — record it failed and move on.
  const [logged] = await db
    .insert(waMessages)
    .values({
      candidateId: view.id,
      conversationId,
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

/**
 * Best-effort phone → candidate lookup for conversations with no `candidateId`
 * link (e.g. an inbound message from a number that predates the outbound-send
 * linking, or was never matched). Computed live from the candidate mirror's
 * contact field on each read — not persisted back to `wa_conversations` — so
 * it always reflects the current sheet data but costs one full table scan per
 * request that needs it. Fine at ~1k candidates; revisit if that changes.
 */
async function buildPhoneMatchMap(): Promise<
  Map<string, { id: string; name: string }>
> {
  const rows = await db
    .select({ id: candidates.id, data: candidates.data })
    .from(candidates);

  const map = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    const view = toCandidateView({
      id: r.id,
      data: r.data as Record<string, string>,
    });
    const phone = normalizePhone(view.contact, [view.location, view.nationality]);
    if (phone.ok) map.set(phone.e164, { id: view.id, name: view.fullName });
  }
  return map;
}

/** A conversation for the list view, with its most recent message as a preview. */
export type ConversationListItem = {
  id: string;
  waPhone: string;
  candidateId: string | null;
  candidateName: string | null;
  lastMessageBody: string | null;
  lastMessageDirection: "in" | "out" | null;
  lastMessageAt: Date | null;
  windowExpiresAt: Date | null;
};

export type ConversationListResult = {
  items: ConversationListItem[];
  total: number;
};

/** Phase 2 conversations, most-recently-active first, each with a last-message preview. */
export async function listConversations(
  opts: { limit?: number; offset?: number } = {},
): Promise<ConversationListResult> {
  const { limit = 20, offset = 0 } = opts;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waConversations);

  const convos = await db
    .select({
      id: waConversations.id,
      waPhone: waConversations.waPhone,
      candidateId: waConversations.candidateId,
      data: candidates.data,
      windowExpiresAt: waConversations.windowExpiresAt,
      lastInboundAt: waConversations.lastInboundAt,
    })
    .from(waConversations)
    .leftJoin(candidates, eq(waConversations.candidateId, candidates.id))
    .orderBy(desc(waConversations.lastInboundAt))
    .limit(limit)
    .offset(offset);

  if (convos.length === 0) return { items: [], total: count };

  // One extra query for last-message previews rather than a correlated
  // subquery — at our volume (~1k messages total) this is simpler and fast
  // enough; take the first (newest) row per conversation in JS.
  const msgs = await db
    .select({
      conversationId: waMessages.conversationId,
      body: waMessages.body,
      direction: waMessages.direction,
      createdAt: waMessages.createdAt,
    })
    .from(waMessages)
    .where(
      inArray(
        waMessages.conversationId,
        convos.map((c) => c.id),
      ),
    )
    .orderBy(desc(waMessages.createdAt));

  const lastByConvo = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) {
    if (!m.conversationId || lastByConvo.has(m.conversationId)) continue;
    lastByConvo.set(m.conversationId, m);
  }

  const phoneMap = convos.some((c) => c.candidateId === null)
    ? await buildPhoneMatchMap()
    : null;

  const items = convos.map((c) => {
    const last = lastByConvo.get(c.id);
    const linked =
      c.candidateId && c.data
        ? {
            id: c.candidateId,
            name: toCandidateView({
              id: c.candidateId,
              data: c.data as Record<string, string>,
            }).fullName,
          }
        : phoneMap?.get(c.waPhone) ?? null;
    return {
      id: c.id,
      waPhone: c.waPhone,
      candidateId: linked?.id ?? null,
      candidateName: linked?.name ?? null,
      lastMessageBody: last?.body ?? null,
      lastMessageDirection: (last?.direction as "in" | "out" | undefined) ?? null,
      lastMessageAt: last?.createdAt ?? c.lastInboundAt,
      windowExpiresAt: c.windowExpiresAt,
    };
  });

  return { items, total: count };
}

/** Conversation header info for the thread view. */
export type ConversationDetail = {
  id: string;
  waPhone: string;
  candidateId: string | null;
  candidateName: string | null;
  windowExpiresAt: Date | null;
};

/** A single message in a conversation thread, in chronological order. */
export type ConversationThreadMessage = {
  id: string;
  direction: "in" | "out";
  body: string | null;
  status: string;
  createdAt: Date;
};

/** One conversation's header info, or null if the id doesn't exist. */
export async function getConversation(
  id: string,
): Promise<ConversationDetail | null> {
  const [row] = await db
    .select({
      id: waConversations.id,
      waPhone: waConversations.waPhone,
      candidateId: waConversations.candidateId,
      data: candidates.data,
      windowExpiresAt: waConversations.windowExpiresAt,
    })
    .from(waConversations)
    .leftJoin(candidates, eq(waConversations.candidateId, candidates.id))
    .where(eq(waConversations.id, id))
    .limit(1);

  if (!row) return null;

  const linked =
    row.candidateId && row.data
      ? {
          id: row.candidateId,
          name: toCandidateView({
            id: row.candidateId,
            data: row.data as Record<string, string>,
          }).fullName,
        }
      : (await buildPhoneMatchMap()).get(row.waPhone) ?? null;

  return {
    id: row.id,
    waPhone: row.waPhone,
    candidateId: linked?.id ?? null,
    candidateName: linked?.name ?? null,
    windowExpiresAt: row.windowExpiresAt,
  };
}

/** A conversation's full message history, oldest first (the WhatsApp thread order). */
export async function getConversationMessages(
  conversationId: string,
): Promise<ConversationThreadMessage[]> {
  const rows = await db
    .select({
      id: waMessages.id,
      direction: waMessages.direction,
      body: waMessages.body,
      status: waMessages.status,
      createdAt: waMessages.createdAt,
    })
    .from(waMessages)
    .where(eq(waMessages.conversationId, conversationId))
    .orderBy(waMessages.createdAt);

  return rows.map((r) => ({ ...r, direction: r.direction as "in" | "out" }));
}
