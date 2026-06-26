// The inbound HTTP boundary for Meta's webhook: subscription verification,
// X-Hub-Signature-256 checking, and parsing Meta's payload into our own shape.
// No DB and no bot logic here — that orchestration lives in ./inbound.ts, which
// the route calls after this module has verified and parsed the request. Mirrors
// client.ts's role on the outbound side. See src/lib/whatsapp/CLAUDE.md.

import { createHmac, timingSafeEqual } from "node:crypto";

/** One inbound text message, normalised from Meta's webhook payload. */
export type InboundTextMessage = {
  /** Meta's message id ("wamid.…") — our idempotency key for dedupe. */
  waMessageId: string;
  /** Sender's number in E.164 digits (no "+"), Meta's wire format. */
  from: string;
  /** The message body. */
  text: string;
  /** When the sender sent it. */
  timestamp: Date;
};

/** Read a required WhatsApp env var, failing loudly if the setup is incomplete. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — WhatsApp webhook is not configured (see src/lib/whatsapp/CLAUDE.md)`,
    );
  }
  return value;
}

/**
 * Handle Meta's GET subscription handshake. Meta calls the webhook URL with
 * `hub.mode=subscribe`, our pre-shared `hub.verify_token`, and a `hub.challenge`
 * to echo back. Returns the challenge string to echo on success, or null if the
 * token doesn't match (the route should then 403).
 */
export function verifySubscription(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN") &&
    challenge !== null
  ) {
    return challenge;
  }
  return null;
}

/**
 * Verify the X-Hub-Signature-256 header against the raw request body using the
 * app secret (HMAC-SHA256). MUST be called with the exact bytes Meta sent — any
 * re-serialisation of the JSON changes the digest. Returns true only on a
 * constant-time match.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", requireEnv("WHATSAPP_APP_SECRET"))
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  // timingSafeEqual throws on length mismatch, so guard first.
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

// ── Meta payload shapes (only the slices we read) ────────────────────────────

type MetaInboundMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type MetaWebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      value?: { messages?: MetaInboundMessage[] };
    }[];
  }[];
};

/**
 * Pull the inbound *text* messages out of a parsed webhook payload. Status
 * callbacks (delivered/read) and non-text message types (image, audio, …) are
 * ignored — the first-cut bot only reads text. Malformed or partial entries are
 * skipped rather than throwing, so one bad item never drops a whole batch.
 */
export function parseInboundTextMessages(
  payload: unknown,
): InboundTextMessage[] {
  const data = payload as MetaWebhookPayload;
  if (data?.object !== "whatsapp_business_account") return [];

  const out: InboundTextMessage[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type !== "text") continue;
        const body = msg.text?.body?.trim();
        if (!msg.id || !msg.from || !body) continue;

        // Meta sends the timestamp as Unix seconds (string); fall back to now.
        const seconds = Number(msg.timestamp);
        const timestamp = Number.isFinite(seconds)
          ? new Date(seconds * 1000)
          : new Date();

        out.push({ waMessageId: msg.id, from: msg.from, text: body, timestamp });
      }
    }
  }
  return out;
}
