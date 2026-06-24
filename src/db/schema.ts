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

// ─── WhatsApp messages (app-state) ───────────────────────────────────────────
//
// The outbound (and later inbound) message log — the core of WhatsApp Phase 1.
// App-only state, so it lives in its OWN table keyed to candidates.id (never
// columns on the mirror — see src/db/CLAUDE.md). Sync physically cannot touch it.
//
// Phase 1 logs directly against the candidate (no wa_conversations thread table
// yet — that arrives with inbound/threading in Phase 2). Both phases share THIS
// table so later work is additive. See src/lib/whatsapp/CLAUDE.md.

export const waMessages = pgTable(
  "wa_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    // 'out' = business-initiated (Phase 1); 'in' = candidate reply (Phase 2).
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
