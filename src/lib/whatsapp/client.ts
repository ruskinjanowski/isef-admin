// Low-level Meta WhatsApp Cloud API client: the HTTP boundary, nothing more.
// Auth + POST to /{phoneNumberId}/messages, returning Meta's wa_message_id. NO
// DB and NO app logic here (no candidate lookup, no logging, no template
// registry) — that orchestration lives in messages.ts, which is the only thing
// the UI bridge should call. See src/lib/whatsapp/CLAUDE.md.

import {
  WhatsAppApiError,
  type MetaErrorResponse,
  type MetaSendResponse,
  type SendResult,
  type SendTemplateInput,
  type SendTextInput,
} from "./types";

// Pin the Graph API version so Meta-side changes never silently shift behaviour.
const GRAPH_VERSION = "v21.0";

/** Read a required WhatsApp env var, failing loudly if the setup is incomplete. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — WhatsApp Cloud API is not configured (see src/lib/whatsapp/CLAUDE.md)`,
    );
  }
  return value;
}

/** POST endpoint for sending messages from our registered number. */
function messagesUrl(): string {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

/**
 * POST one message payload to Meta and unwrap the result. The shared transport
 * for every send: auth header, request, error mapping, and pulling out Meta's
 * wa_message_id. Callers only build the message-specific body. Throws
 * {@link WhatsAppApiError} with Meta's detail on rejection.
 */
async function postMessage(body: Record<string, unknown>): Promise<SendResult> {
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const res = await fetch(messagesUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as
    | MetaSendResponse
    | MetaErrorResponse;

  if (!res.ok) {
    const err = (json as MetaErrorResponse).error;
    throw new WhatsAppApiError(
      err?.message ?? `WhatsApp send failed with HTTP ${res.status}`,
      res.status,
      err?.code,
    );
  }

  const waMessageId = (json as MetaSendResponse).messages?.[0]?.id;
  if (!waMessageId) {
    throw new WhatsAppApiError(
      "WhatsApp send accepted but returned no message id",
      res.status,
    );
  }
  return { waMessageId };
}

/**
 * Send an approved template to one recipient. The variables must already be
 * resolved (that mapping is templates.ts's job); this only shapes the wire
 * payload and POSTs it. Returns Meta's wa_message_id on success, throws
 * {@link WhatsAppApiError} with Meta's detail on rejection.
 */
export async function sendTemplate(
  input: SendTemplateInput,
): Promise<SendResult> {
  // Meta only accepts a `components` array when there are variables to fill; an
  // empty body component is rejected, so omit it for no-parameter templates.
  const components =
    input.params.length > 0
      ? [{ type: "body", parameters: input.params }]
      : undefined;

  return postMessage({
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/**
 * Send a free-form text message to one recipient. Only valid inside the 24h
 * customer-service window — Meta rejects out-of-window free-form sends, so this
 * is for Phase 2 bot replies to an inbound message, never first contact (use
 * {@link sendTemplate} for that). Returns Meta's wa_message_id on success.
 */
export async function sendText(input: SendTextInput): Promise<SendResult> {
  return postMessage({
    messaging_product: "whatsapp",
    to: input.to,
    type: "text",
    text: { body: input.body },
  });
}
