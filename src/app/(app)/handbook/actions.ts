"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isAdmin } from "@/lib/access";
import {
  createPage,
  deletePage,
  updatePage,
  type HandbookPage,
} from "@/lib/handbook/handbook";

// Admin-only bridge over src/lib/handbook. The handbook feeds the WhatsApp bot,
// so editing it sits in the privileged tier (like Sync/Users/Messages); every
// mutation re-checks admin server-side. UI lives in ./page.tsx + ./handbook-editor.

type PageResult = { page?: HandbookPage; error?: string };

export async function createHandbookPage(title: string): Promise<PageResult> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { error: "Admin access required." };

  const res = await createPage(title, me.id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/handbook");
  return { page: res.page };
}

export async function updateHandbookPage(
  id: string,
  fields: { title: string; content: string },
): Promise<PageResult> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { error: "Admin access required." };

  const res = await updatePage(id, fields, me.id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/handbook");
  return { page: res.page };
}

export async function deleteHandbookPage(id: string): Promise<{ error?: string }> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { error: "Admin access required." };

  const res = await deletePage(id);
  if (res.error) return res;
  revalidatePath("/handbook");
  return {};
}
