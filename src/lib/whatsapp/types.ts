// Shared WhatsApp types: our domain shapes plus the slices of Meta's Cloud API
// payloads we touch. Kept dependency-free so both the HTTP client (client.ts)
// and the domain layer (messages.ts) can import without cycles.

/** Message direction, matching the `wa_messages.direction` check constraint. */
export type WaDirection = "in" | "out";

/** Message kind, matching the `wa_messages.type` check constraint. */
export type WaType = "template" | "text";

/** Delivery lifecycle, matching the `wa_messages.status` check constraint. */
export type WaStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * One resolved positional template variable. Meta fills `{{1}}`, `{{2}}`, … in
 * order, so the array index is the position; only text body params in Phase 1.
 */
export type TemplateParam = { type: "text"; text: string };

/** What client.sendTemplate needs: an already-resolved, ready-to-send payload. */
export type SendTemplateInput = {
  /** Recipient in E.164 *without* the leading "+" (Meta's wire format). */
  to: string;
  /** Approved template name as registered on the WABA. */
  templateName: string;
  /** BCP-47 language code the template was approved under, e.g. "en" / "en_US". */
  languageCode: string;
  /** Positional body variables, in `{{1}}`, `{{2}}`, … order. May be empty. */
  params: TemplateParam[];
};

/** The bit of Meta's /messages success response we keep: the message id. */
export type SendResult = {
  /** Meta's `wa_message_id` ("wamid.…"), our correlation key for status webhooks. */
  waMessageId: string;
};

/** Shape Meta returns from POST /{phoneNumberId}/messages on success. */
export type MetaSendResponse = {
  messaging_product: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
};

/** Shape Meta returns on error (HTTP 4xx/5xx). */
export type MetaErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/** Thrown by the client when Meta rejects a send; carries Meta's error detail. */
export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "WhatsAppApiError";
    this.status = status;
    this.code = code;
  }
}
