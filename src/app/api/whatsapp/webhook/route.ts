// Meta WhatsApp webhook endpoint. Thin: GET handles Meta's subscription
// handshake; POST verifies the signature, parses inbound text, and hands each
// message to the domain layer. We respond 200 immediately and do the slow work
// (LLM + reply) in after() so Meta isn't kept waiting — it retries on slow/non-2xx
// responses, which would double-send. All real logic is in src/lib/whatsapp/
// (webhook.ts + inbound.ts). See src/lib/whatsapp/CLAUDE.md.

import { after } from "next/server";

import { handleInboundMessage } from "@/lib/whatsapp/inbound";
import {
  parseInboundTextMessages,
  verifySignature,
  verifySubscription,
} from "@/lib/whatsapp/webhook";

// The bot reply (Claude call) runs in after(), past the 200 — give it room.
export const maxDuration = 60;

/** Meta's one-time subscription verification (GET with hub.* query params). */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const challenge = verifySubscription(params);
  if (challenge === null) {
    return new Response("Forbidden", { status: 403 });
  }
  // Meta expects the raw challenge echoed back as plain text.
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/** Inbound message delivery (POST, signed with X-Hub-Signature-256). */
export async function POST(request: Request) {
  // Read the raw body once — signature verification needs the exact bytes Meta
  // sent, so we can't let the framework re-serialise the JSON.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed body — ack with 200 so Meta doesn't retry a payload we can't use.
    return new Response("OK", { status: 200 });
  }

  // Schedule the slow per-message work to run after the response is sent.
  for (const message of parseInboundTextMessages(payload)) {
    after(() => handleInboundMessage(message));
  }

  return new Response("OK", { status: 200 });
}
