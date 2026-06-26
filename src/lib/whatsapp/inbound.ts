// Inbound orchestration: take one parsed inbound message and drive the whole
// reply cycle — upsert its conversation, dedupe, log it, ask the bot for a
// reply, send the reply, and log that too. This is the domain layer the webhook
// route's after() hook calls; it never touches the HTTP boundary (signature /
// payload parsing live in ./webhook.ts) and never calls client.ts for outbound
// directly except through here. See src/lib/whatsapp/CLAUDE.md.

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { waConversations, waMessages } from "@/db/schema";
import { generateReply, type BotTurn } from "@/lib/bot/bot";
import { humanHandoffMessage } from "@/lib/bot/prompt";
import { sendText } from "./client";
import { type InboundTextMessage } from "./webhook";

// How many prior turns to feed the bot for context. Conversations are short FAQ
// exchanges, so a small window keeps the prompt cheap while preserving thread.
const HISTORY_LIMIT = 10;

// Meta's customer-service window: free-form replies are allowed for 24h after
// the contact's last inbound message.
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Process one inbound text message end-to-end. Idempotent: a redelivered
 * webhook (same Meta message id) is logged once and never answered twice.
 * Designed to run inside the route's after() hook — it does its own error
 * handling and never throws back to the caller, so one bad message can't break
 * the batch or surface after the 200 has been sent.
 */
export async function handleInboundMessage(
  msg: InboundTextMessage,
): Promise<void> {
  try {
    const now = new Date();
    const windowExpiresAt = new Date(msg.timestamp.getTime() + WINDOW_MS);

    // Upsert the phone-keyed conversation and refresh its 24h window clock.
    const [conversation] = await db
      .insert(waConversations)
      .values({
        waPhone: msg.from,
        windowExpiresAt,
        lastInboundAt: msg.timestamp,
      })
      .onConflictDoUpdate({
        target: waConversations.waPhone,
        set: { windowExpiresAt, lastInboundAt: msg.timestamp, updatedAt: now },
      })
      .returning({ id: waConversations.id });

    // Log the inbound, deduping on Meta's message id. If the row already exists
    // this is a redelivery — stop here so we don't reply twice.
    const [logged] = await db
      .insert(waMessages)
      .values({
        conversationId: conversation.id,
        direction: "in",
        type: "text",
        body: msg.text,
        waMessageId: msg.waMessageId,
        status: "delivered",
      })
      .onConflictDoNothing({ target: waMessages.waMessageId })
      .returning({ id: waMessages.id });

    if (!logged) return; // duplicate delivery — already handled

    const history = await loadHistory(conversation.id);
    const reply = await generateOrHandoff(history);

    await sendAndLog(conversation.id, msg.from, reply);
  } catch (err) {
    // after() runs post-response, so there's no caller to surface this to — log
    // and move on. The contact may get silence on a hard failure; that's the
    // acceptable failure mode for now (no retry/queue in the first cut).
    console.error(
      `Failed to handle inbound WhatsApp message ${msg.waMessageId}:`,
      err,
    );
  }
}

/** Recent turns for the conversation, oldest→newest, mapped to the bot's view. */
async function loadHistory(conversationId: string): Promise<BotTurn[]> {
  const rows = await db
    .select({ direction: waMessages.direction, body: waMessages.body })
    .from(waMessages)
    .where(
      and(
        eq(waMessages.conversationId, conversationId),
        isNotNull(waMessages.body),
      ),
    )
    .orderBy(desc(waMessages.createdAt))
    .limit(HISTORY_LIMIT);

  // Queried newest-first for the limit; reverse to chronological for the model.
  return rows
    .reverse()
    .map((r) => ({
      role: r.direction === "in" ? "user" : "assistant",
      text: r.body ?? "",
    }));
}

/**
 * Ask the bot for a reply, falling back to a fixed human-handoff line if the
 * Claude call fails outright (vs. the bot *deciding* to hand off, which is just
 * normal reply text). Either way the contact gets a useful message.
 */
async function generateOrHandoff(history: BotTurn[]): Promise<string> {
  try {
    return await generateReply(history);
  } catch (err) {
    console.error("Bot reply generation failed; using handoff fallback:", err);
    return humanHandoffMessage();
  }
}

/** Send the bot's reply over WhatsApp and log it (sent_by = null = bot). */
async function sendAndLog(
  conversationId: string,
  to: string,
  body: string,
): Promise<void> {
  // Log first so a crash mid-send still leaves a trace, then reconcile.
  const [logged] = await db
    .insert(waMessages)
    .values({
      conversationId,
      direction: "out",
      type: "text",
      body,
      status: "queued",
      sentBy: null,
    })
    .returning({ id: waMessages.id });

  try {
    const { waMessageId } = await sendText({ to, body });
    await db
      .update(waMessages)
      .set({ status: "sent", waMessageId, updatedAt: new Date() })
      .where(eq(waMessages.id, logged.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown send error";
    await db
      .update(waMessages)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(waMessages.id, logged.id));
    throw err;
  }
}
