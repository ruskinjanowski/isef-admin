import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Auth (Better Auth) ──────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name"),
    image: text("image"),
    // ── App access control (not Better-Auth-managed; we set these) ──
    // Registration is open, but inert: every new sign-up lands as `pending` and
    // cannot use the app until an admin flips it to `approved` (`disabled`
    // revokes access again). `status` answers "may this account in at all?";
    // `role` answers "what may it do once in?" — `admin` unlocks user
    // management, Sync/import and tier recalc; `reviewer` can view + screen
    // candidates. Kept as two columns so "approved but read-only" never needs a
    // migration. The first-ever user is bootstrapped to admin/approved (see
    // src/lib/auth.ts + drizzle/0005_*). Enforcement lives in src/lib/access.ts.
    role: text("role").notNull().default("reviewer"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("user_role", sql`${t.role} in ('admin', 'reviewer')`),
    check("user_status", sql`${t.status} in ('pending', 'approved', 'disabled')`),
  ],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  idToken: text("id_token"),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Candidates (registration mirror of the source Google Sheet) ─────────────
//
// This table is a *pure mirror* of the candidate registration form data and
// holds NO app state. One-way sync target: the manual Sync button upserts rows
// here by `sheetKey` (the stable key from the sheet — the lowercased email),
// never by row number. `data` holds every mirrored cell as JSON.
//
// App-only state (pipeline status, notes, scores, …) lives in SEPARATE tables
// keyed back to this one, added as in-app features need them — never columns
// here. Keeping this table free of app state means sync can never clobber it.
// See src/db/CLAUDE.md for the data-setup philosophy.

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stable key from the source sheet (lowercased email).
  sheetKey: text("sheet_key").notNull().unique(),
  // Every mirrored cell from the sheet, keyed by column header.
  data: jsonb("data").notNull().default({}),
  // Bookkeeping for the sync.
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Screening (app-state) ───────────────────────────────────────────────────
//
// Reviewer-entered screening fields for a candidate. App-only state, so it lives
// in its OWN table keyed to candidates.id (never columns on the mirror — see
// src/db/CLAUDE.md). One row per candidate (unique FK); the UI edits it in place
// and upserts. Sync cannot touch this.

export const screening = pgTable(
  "screening",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: "cascade" }),
    // Appearance rating ordinal 1–5 (1 Poor … 5 Excellent); labels + tier
    // points in src/lib/screening/appearance.ts. Nullable: may be unscored.
    appearance: integer("appearance"),
    race: text("race"),
    // Reasoning for the manual tier adjustment below (repurposed from generic
    // reviewer notes).
    notes: text("notes"),
    // Manual reviewer override added to the computed tier score (±), e.g. +8 to
    // bump a strong candidate the heuristic under-rates. Nullable = no override.
    // Folded into the score during tier computation (see src/lib/tiering/).
    manualAdjustment: integer("manual_adjustment"),
    // Derived tier — recomputed from the mirror fields + race/appearance +
    // manual adjustment whenever screening is saved, and by the bulk
    // "Recalculate all tiers" job (see src/lib/tiering/). Not entered by hand.
    // `tier` 1–3, or NULL = Unranked (candidate not yet screened).
    // `tier_score` is the 0–100 heuristic the tier is banded from; the per-line
    // breakdown is recomputed live on the breakdown page, not stored.
    tier: smallint("tier"),
    tierScore: integer("tier_score"),
    tierComputedAt: timestamp("tier_computed_at", { withTimezone: true }),
    // Reviewer who last saved this row. Null-safe if the user is later deleted.
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("appearance_range", sql`${t.appearance} between 1 and 5`),
    check("tier_range", sql`${t.tier} between 1 and 3`),
    check(
      "manual_adjustment_range",
      sql`${t.manualAdjustment} between -100 and 100`,
    ),
  ],
);

// ─── WhatsApp conversations (app-state) ──────────────────────────────────────
//
// One inbound thread per phone number (Phase 2). App-only state in its OWN
// table; Sync cannot touch it. Keyed by phone — NOT candidate_id — because an
// inbound message can arrive from a number that matches no candidate, so the
// thread must have a home regardless. `candidate_id` is a best-effort link to a
// known candidate (nullable; populated later when phone↔candidate matching lands
// with the DB-aware bot). `wa_messages` rows point here via `conversation_id`.
//
// The per-conversation bot/human toggle and assignment (mode, assigned_to) are
// deliberately NOT here yet — the first cut is a handbook-grounded auto-reply
// bot with a human-handoff line, not a shared inbox. See src/lib/whatsapp/CLAUDE.md.

export const waConversations = pgTable("wa_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The contact's number in E.164 digits (no leading "+"), Meta's wire format.
  // The stable key for the thread; one conversation per number.
  waPhone: text("wa_phone").notNull().unique(),
  // Best-effort link to a known candidate. Nullable: inbound can come from a
  // stranger, and phone↔candidate matching is deferred to the DB-aware bot.
  candidateId: uuid("candidate_id").references(() => candidates.id, {
    onDelete: "set null",
  }),
  // When the 24h customer-service window closes (24h after the last inbound).
  // Free-form replies — including the bot's — are only allowed before this.
  windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }),
  // Timestamp of the most recent inbound message, for the window clock + sorting.
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── WhatsApp messages (app-state) ───────────────────────────────────────────
//
// The outbound (and later inbound) message log — the core of WhatsApp Phase 1.
// App-only state, so it lives in its OWN table keyed to candidates.id (never
// columns on the mirror — see src/db/CLAUDE.md). Sync physically cannot touch it.
//
// Phase 1 logs outbound templates directly against the candidate. Phase 2 adds
// inbound + bot replies, which thread through `wa_conversations` (keyed by phone,
// since an inbound can come from a number that matches no candidate) — those
// rows carry `conversation_id` and a null `candidate_id`. Both phases share THIS
// table so later work is additive. See src/lib/whatsapp/CLAUDE.md.

export const waMessages = pgTable(
  "wa_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The candidate this message belongs to, when known. Set for Phase 1
    // outbound template sends. NULL for Phase 2 inbound/bot traffic, which is
    // keyed by `conversation_id` instead — an inbound number may match no
    // candidate. Every row has at least one of {candidate_id, conversation_id}.
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "cascade",
    }),
    // The phone-keyed conversation thread this message belongs to (Phase 2
    // inbound + bot replies). NULL for Phase 1 outbound template sends, which
    // predate threading and key off `candidate_id`.
    conversationId: uuid("conversation_id").references(() => waConversations.id, {
      onDelete: "cascade",
    }),
    // 'out' = business-initiated (Phase 1) or bot reply (Phase 2); 'in' =
    // candidate/contact reply (Phase 2).
    direction: text("direction").notNull(),
    // 'template' = pre-approved template send (the only Phase 1 path — first
    // contact is out-of-window so it MUST be a template); 'text' = free-form,
    // only valid inside the 24h window (Phase 2).
    type: text("type").notNull(),
    // The approved template's name (null for free-form text). The variable
    // mapping lives in src/lib/whatsapp/templates.ts, not here.
    templateName: text("template_name"),
    // The rendered message body we sent/received, for display in the log.
    body: text("body"),
    // Meta's wa_message_id — the correlation key for delivery-status webhooks
    // (Phase 2). Null until Meta accepts the send; unique when present.
    waMessageId: text("wa_message_id").unique(),
    // Lifecycle: 'queued' before we hand off to Meta, 'sent' once accepted,
    // 'delivered'/'read' from status webhooks (Phase 2), 'failed' on error.
    status: text("status").notNull().default("queued"),
    // Meta error detail when status = 'failed' (e.g. invalid number, opt-out).
    error: text("error"),
    // Reviewer who triggered the send. Null = system/bot (Phase 2 auto-replies).
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("wa_direction", sql`${t.direction} in ('in', 'out')`),
    check("wa_type", sql`${t.type} in ('template', 'text')`),
    check(
      "wa_status",
      sql`${t.status} in ('queued', 'sent', 'delivered', 'read', 'failed')`,
    ),
  ],
);

// ─── Handbook pages (app-state) ──────────────────────────────────────────────
//
// The knowledge base the WhatsApp chatbot answers from (Phase 2). App-only
// content authored in the admin UI, so it lives in its OWN table; Sync never
// touches it. NOT keyed to candidates — this is shared reference material, not
// per-candidate state.
//
// One row per page (e.g. "Visa application", "Accommodation"), so the handbook
// can be edited in small pieces instead of one giant document. At query time
// the bot concatenates every page — sorted by (position, createdAt) for a
// byte-stable, prompt-cacheable system prompt — and answers strictly from it,
// referring to a human when a question isn't covered. ~10 pages total fits in
// the context window with room to spare, so no search/RAG is needed. See
// src/lib/handbook/ and src/lib/whatsapp/CLAUDE.md.

export const handbookPages = pgTable("handbook_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Page name, shown in the editor's page picker and used as the markdown
  // heading when the page is assembled into the bot's handbook.
  title: text("title").notNull(),
  // The page body as markdown. May be empty (a freshly-created page).
  content: text("content").notNull().default(""),
  // Manual sort order for the page list and the assembled handbook. Lower
  // first; ties broken by createdAt so the assembled text is deterministic.
  position: integer("position").notNull().default(0),
  // Admin who last saved this page. Null-safe if the user is later deleted.
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
