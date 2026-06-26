// The bot brain: turn a conversation history into a single reply, grounded in
// the handbook (see ./prompt.ts). Wraps the Anthropic SDK — the only place we
// call Claude. The webhook orchestration (src/lib/whatsapp/inbound.ts) calls
// generateReply() and sends whatever comes back.
//
// Model: Claude Opus 4.8 with adaptive thinking — the grounding decision
// (answer vs. hand off) benefits from the model reasoning before it commits.
// The system prompt is marked for prompt caching since it's stable per handbook.

import Anthropic from "@anthropic-ai/sdk";

import { buildSystemPrompt } from "./prompt";

const MODEL = "claude-sonnet-4-6";

// WhatsApp replies are short; the cap is generous enough that adaptive thinking
// plus a few-sentence answer never truncates, but small enough to keep the bot
// from rambling on if a prompt goes sideways.
const MAX_TOKENS = 2048;

/** One turn of the conversation, in the bot's view. */
export type BotTurn = {
  /** 'user' = the contact's inbound message; 'assistant' = a prior bot reply. */
  role: "user" | "assistant";
  text: string;
};

let client: Anthropic | null = null;

/** Lazily build the SDK client so importing this module never throws at boot. */
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — the WhatsApp chatbot is not configured",
    );
  }
  return (client ??= new Anthropic());
}

/**
 * Generate the bot's reply to a conversation. `history` is oldest→newest and
 * must end with the contact's latest inbound turn. Returns the reply text
 * (either a handbook-grounded answer or a human-handoff line — both are just
 * the model's text output). Throws if Claude can't be reached or the API errors;
 * the caller decides how to surface that to the contact.
 */
export async function generateReply(history: BotTurn[]): Promise<string> {
  const system = await buildSystemPrompt();

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    system: [
      // The handbook + persona block is stable between messages, so cache it —
      // most of each request's input tokens are then served from cache.
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: history.map((turn) => ({
      role: turn.role,
      content: turn.text,
    })),
  });

  // Adaptive thinking yields thinking blocks (empty text by default) plus the
  // answer in text blocks — keep only the text.
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude returned no text content for the bot reply");
  }
  return text;
}
