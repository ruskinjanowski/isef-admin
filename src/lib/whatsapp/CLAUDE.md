# WhatsApp messaging

Outbound (and later inbound) WhatsApp messaging for candidates. This file records
the **intent and architecture** for the feature. Read it before adding any code
under `src/lib/whatsapp/`, `src/app/api/whatsapp/`, or the WhatsApp UI.

## Decision: Meta Cloud API, direct (no BSP, no SaaS dashboard)

We connect straight to **Meta's WhatsApp Business Platform (Cloud API)** — no
aggregator (Twilio/360dialog) and no hosted-inbox SaaS (Wati/AiSensy).

Why:

- **Cost.** At our volume (~100 welcome templates + at most ~1,000 inbound
  messages/month) Meta's per-message fees are a couple of dollars/month, and
  there is **no platform subscription**. User-initiated (inbound) conversations
  are free; only proactive templates are billed.
- **One system of record.** Candidates live in our Neon DB + this admin app. A
  SaaS inbox would be a separate silo that doesn't know about tiers, statuses, or
  screening. The dashboard lives **in our own UI**, next to the candidate data.
- **The chatbot (phase 2) needs our DB.** Its whole value is answering "what's my
  status / tier / next step" from Postgres. Keeping messaging in-app avoids paying
  a SaaS to host an inbox we'd outgrow the moment we add the bot.

## Communication model: two numbers

Two separate WhatsApp numbers, by deliberate choice (not a constraint we're
working around):

- **Human business number** — her existing WhatsApp Business *app* number. A
  person answers it directly on the phone; manual conversations. This project does
  **not** touch it — she keeps her current workflow as-is.
- **Chatbot / announcement number** — a separate number on the Cloud API, run by
  this app. A secondary line of communication to candidates, where they can:
  - receive **announcements** (including **group announcements** to many candidates),
  - have **basic questions answered automatically** by the bot,
  - and, when the bot doesn't know, be told to **contact a person directly** on the
    human business number for anything more.

At rollout we want **at least a basic bot** in place — enough that an inbound
question the bot can't answer gets an automatic "please contact <person> on
<number>" reply rather than silence. We also need a way to **view and manage these
conversations** and to **send group announcements** from the admin UI.

(Brief overview of intent. Detailed mechanics — the 24h window, bot/human handoff,
DB-aware answers — are still TBD below and shouldn't be invented ahead of need.)

## Status & phased plan

- **Phase 1 (now): outbound welcome templates + a message log/dashboard.**
  Send an approved template to a candidate from the admin UI; record every send
  and its delivery status. No chatbot, no inbound handling required to ship this.
- **Phase 2 (later): inbound + chatbot.** Webhook receives replies; a Claude
  tool-use loop answers from our DB; per-conversation **bot/human** toggle with a
  shared-inbox handoff (one number, humans reply from this UI). See the parent
  conversation / root planning notes — not built yet.

> **Updated by the two-number decision:** rollout scope now also includes a
> *basic* inbound bot (auto-reply with human-handoff fallback), conversation
> viewing/management, and group announcements — see "Communication model". This
> pulls a minimal slice of the old phase-2 inbound work into the initial rollout.
> The fuller bot (DB-aware tool-use answers, per-conversation bot/human toggle)
> stays later — keep that plumbing out of the first cut.

Both phases share the same `wa_messages` log, so later work is additive.

## Load-bearing external constraints (Meta's rules — design around these)

- **24-hour customer service window.** Free-form messages are only allowed within
  24h of the candidate's last inbound message. Our **welcome message is proactive
  / out-of-window**, so it **must** be a pre-approved **template** — there is no
  free-text path for first contact. (Phase 2's chatbot replies live *inside* the
  window and can be free-form.)
- **Templates are pre-approved by Meta** and billed per message by category. A
  "thanks for applying, here's what's next" message should be submitted as a
  **Utility** template where possible (cheaper than Marketing). Templates support
  positional variables (`Hi {{1}}, …`).
- **Cloud API number is separate from her phone.** A number registered to the
  Cloud API **cannot** also be used in the consumer WhatsApp Business phone app —
  they're mutually exclusive. That mutual exclusivity is exactly why we run **two
  numbers** (see "Communication model"): her human business number stays on the
  phone app, and this app uses its own separate number.

## Separation of concerns

Follows the project rule: **domain logic in `src/lib`, UI in `src/app`, with a
thin bridge between** (mirrors `src/lib/candidates` ↔ `src/app/(app)/import`). No
Meta API calls, signing, or message-shaping logic in UI/route files.

```
src/lib/whatsapp/
  client.ts      # Low-level Meta Cloud API client: auth, POST to /messages,
                 #   send a template, send free-form text (phase 2). No DB, no app
                 #   logic — just the HTTP boundary. Returns Meta's wa_message_id.
  templates.ts   # Registry of our approved templates (name, language, variable
                 #   mapping). Single source of truth for what we can send.
  messages.ts    # Domain operations: sendWelcome(candidate), logMessage(...),
                 #   status updates. Orchestrates client + DB. This is what the UI
                 #   bridge calls — never client.ts directly.
  webhook.ts     # (phase 2) Inbound parse + X-Hub signature verification.
  types.ts       # Shared types (message direction, status, Meta payload shapes).
  CLAUDE.md      # this file
```

- **`src/app/api/whatsapp/...`** — route handlers stay thin: parse/authorize the
  request, call `messages.ts`, return. (Webhook verify+receive lands here in
  phase 2.)
- **`src/app/(app)/whatsapp/`** (or a "Messages" nav entry) — the dashboard UI:
  conversations/log list + a "Send welcome" action. Thin; delegates to a server
  action or API route that calls `src/lib/whatsapp/messages.ts`. No Meta logic in
  `.tsx` files or `actions.ts` beyond calling the lib.

## Data model (app-state — sync never touches it)

Per `src/db/CLAUDE.md`, this is app state in its **own** tables, keyed to
`candidates.id` (never columns on the `candidates` mirror, never the email):

- **`wa_conversations`** — one per candidate thread. Fields anticipated:
  `candidate_id` (FK → candidates.id), `wa_phone`, `mode` ('bot'|'human', phase 2),
  `window_expires_at` (24h clock, phase 2), `assigned_to` (→ users.id, phase 2),
  timestamps. *Phase 1 may defer this table and log against the candidate
  directly; add it when inbound/threading arrives.*
- **`wa_messages`** — the log (the core of phase 1): `candidate_id` (or
  `conversation_id`) FK, `direction` ('in'|'out'), `body`, `type`
  ('template'|'text'), `template_name`, `wa_message_id` (Meta's id, for status
  correlation), `status` ('sent'|'delivered'|'read'|'failed'), `sent_by`
  (→ users.id; null = bot), `created_at`.

Follow the schema-change workflow in `src/db/CLAUDE.md` (edit `schema.ts` →
`db:generate` → review SQL → `db:migrate`).

## Environment variables (add to root env list)

```
WHATSAPP_PHONE_NUMBER_ID=      # from Meta app — the sender number's id
WHATSAPP_BUSINESS_ACCOUNT_ID=  # WABA id — used to manage/submit templates
WHATSAPP_ACCESS_TOKEN=         # permanent access token for the Cloud API
WHATSAPP_WEBHOOK_VERIFY_TOKEN= # (phase 2) our chosen token for webhook GET verify (pre-generated)
WHATSAPP_APP_SECRET=           # (phase 2) for X-Hub-Signature verification
```

The phone number must be a number **not** currently on consumer WhatsApp. Meta
provides a free test number for development before registering the real one.

## Meta setup state (as of 2026-06-25)

Meta-side onboarding is **done** — the account runs in production under a personal
Facebook account / Business Portfolio for now, with the option to transfer the
portfolio (or share the app + WABA assets) to the client's official business later.
The app, WABA, and templates are portable; only the phone-number ↔ WABA binding is
permanent.

| Item | Status | Value |
| --- | --- | --- |
| Meta app | ✅ | "ISEF Admin" (app id `4429232967395743`) |
| Phone number registered | ✅ | `+27 65 592 0899` — verified name "ISEF Assistant", quality GREEN |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | `1229079690278350` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA) | ✅ | `1038146275559467` |
| Access token | ✅ | in `.env.local` (verified working via read-only call) |
| Payment method | ✅ | added (required for business-initiated/template sends) |
| Webhook verify token | ✅ | pre-generated in `.env.local`; callback URL not wired (phase 2) |
| Welcome template | ⬜ | not yet created — see next steps |

The real SA SIM is a dedicated line (recycled prepaid, claimed + cleared off
consumer WhatsApp before registering).

> **`hello_world` cannot smoke-test the real number.** Meta now restricts the
> default `hello_world` template to its *Public Test Numbers* — sending it from
> our registered production number returns `(#131058) Hello World templates can
> only be sent from the Public Test Numbers`. Verified 2026-06-25 via
> `scripts/wa-smoke-test.ts`, which confirmed the client itself works end-to-end
> (auth, transport, payload, error handling all good — only Meta's business rule
> blocked it). **Consequence:** the first real send must use *our own* approved
> template, so creating the welcome template is the next critical-path step, not
> an after-the-client nicety.

### Phase 1 build progress

- ✅ **Schema** — `wa_messages` added + migrated (`drizzle/0007_grey_gressill.sql`).
  Phase 1 logs directly against `candidate_id`; no `wa_conversations` yet.
- ✅ **Lib** — `types.ts`, `client.ts` (Meta HTTP boundary; **validated live** —
  auth/transport/error-handling all work, see the `#131058` note above),
  `phone.ts` (free-text → E.164, flags ambiguous numbers rather than guessing),
  `templates.ts` (registry + per-candidate variable resolution), `messages.ts`
  (`sendTemplateToCandidates` + `listRecentMessages`, logs every attempt).
- ⬜ **Welcome template** — submit a Utility template named `welcome`, language
  `en`, body matching `templates.ts`'s `WA_TEMPLATES[0].bodyTemplate`
  (`Hi {{1}}, …`). **Now critical path** — the first real send needs it (the
  `hello_world` shortcut is dead from a production number). Adjust the registry
  entry if Meta edits it during review.
- ⬜ **Bridge + UI** — a server action/route that calls
  `messages.sendTemplateToCandidates`; a candidate table with **persistent
  checkbox selection across pages** + a template picker + a "Send" action, plus a
  message-log view backed by `listRecentMessages`. Targeting is checkbox-only
  (decided 2026-06-25); filter-based "send to all matching" was deferred.

`scripts/wa-smoke-test.ts` is a throwaway end-to-end check (hello_world); delete
once a real template + UI exist.
