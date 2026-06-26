// Read/write core for the chatbot handbook (app-state). Pure domain logic — the
// admin editor's server actions are a thin bridge over this, and the bot reads
// the assembled handbook from `assembleHandbook()`.
//
// The handbook is a set of markdown pages (own table, not keyed to candidates),
// edited in the admin UI. The bot answers strictly from the assembled text, so
// this module is the single source of truth for "what the bot knows". See
// src/db/CLAUDE.md (app-state split) and src/lib/whatsapp/CLAUDE.md (the bot).

import { asc, eq, max } from "drizzle-orm";

import { db } from "@/db";
import { handbookPages } from "@/db/schema";

const TITLE_MAX = 200;

/** One handbook page as the editor sees it. */
export type HandbookPage = {
  id: string;
  title: string;
  content: string;
  position: number;
  updatedAt: string;
};

function toView(row: {
  id: string;
  title: string;
  content: string;
  position: number;
  updatedAt: Date;
}): HandbookPage {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    position: row.position,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Deterministic order — (position, createdAt) — shared by the editor list and
// the assembled handbook. The stable order is what keeps the bot's system
// prompt byte-identical between messages, so prompt caching stays warm.
const ORDER = [asc(handbookPages.position), asc(handbookPages.createdAt)] as const;

/** All pages, in their canonical order. */
export async function listPages(): Promise<HandbookPage[]> {
  const rows = await db
    .select({
      id: handbookPages.id,
      title: handbookPages.title,
      content: handbookPages.content,
      position: handbookPages.position,
      updatedAt: handbookPages.updatedAt,
    })
    .from(handbookPages)
    .orderBy(...ORDER);
  return rows.map(toView);
}

/** Trim a title; returns null if blank or too long. */
function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > TITLE_MAX) return null;
  return trimmed;
}

/**
 * Create a new (empty) page at the end of the list. New pages sort last: their
 * position is one past the current max, so adding a page never reorders the
 * others (and never invalidates more of the prompt cache than necessary).
 */
export async function createPage(
  title: string,
  userId: string,
): Promise<{ ok: true; page: HandbookPage } | { ok: false; error: string }> {
  const clean = cleanTitle(title);
  if (!clean) {
    return { ok: false, error: `Title is required (max ${TITLE_MAX} chars).` };
  }

  // New pages sort last: one past the current max position (or 0 if empty), so
  // adding a page never reorders the others.
  const [{ maxPosition } = { maxPosition: null }] = await db
    .select({ maxPosition: max(handbookPages.position) })
    .from(handbookPages);
  const nextPosition = (maxPosition ?? -1) + 1;

  const [row] = await db
    .insert(handbookPages)
    .values({ title: clean, position: nextPosition, updatedBy: userId })
    .returning({
      id: handbookPages.id,
      title: handbookPages.title,
      content: handbookPages.content,
      position: handbookPages.position,
      updatedAt: handbookPages.updatedAt,
    });
  return { ok: true, page: toView(row) };
}

/** Update a page's title and/or body. */
export async function updatePage(
  id: string,
  fields: { title: string; content: string },
  userId: string,
): Promise<{ ok: true; page: HandbookPage } | { ok: false; error: string }> {
  const clean = cleanTitle(fields.title);
  if (!clean) {
    return { ok: false, error: `Title is required (max ${TITLE_MAX} chars).` };
  }
  const content = typeof fields.content === "string" ? fields.content : "";

  const [row] = await db
    .update(handbookPages)
    .set({ title: clean, content, updatedBy: userId, updatedAt: new Date() })
    .where(eq(handbookPages.id, id))
    .returning({
      id: handbookPages.id,
      title: handbookPages.title,
      content: handbookPages.content,
      position: handbookPages.position,
      updatedAt: handbookPages.updatedAt,
    });
  if (!row) return { ok: false, error: "Page not found." };
  return { ok: true, page: toView(row) };
}

/** Delete a page. */
export async function deletePage(id: string): Promise<{ error?: string }> {
  await db.delete(handbookPages).where(eq(handbookPages.id, id));
  return {};
}

/**
 * Assemble every page into one markdown document for the bot's system prompt.
 * Pages are emitted in canonical order as `## {title}` sections. The output is
 * deterministic for a given set of pages, which is what makes it safe to mark
 * prompt-cached downstream. Returns "" when there are no pages.
 */
export async function assembleHandbook(): Promise<string> {
  const pages = await listPages();
  return pages
    .map((p) => `## ${p.title}\n\n${p.content.trim()}`)
    .join("\n\n")
    .trim();
}
