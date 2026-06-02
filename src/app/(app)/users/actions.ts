"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, isAdmin, type Role, type UserStatus } from "@/lib/access";

type Result = { error?: string };

const ROLES: Role[] = ["admin", "reviewer"];
const STATUSES: UserStatus[] = ["pending", "approved", "disabled"];

/** Count of accounts that can actually administer (approved admins). */
async function approvedAdminCount(): Promise<number> {
  const rows = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users);
  return rows.filter((u) => u.role === "admin" && u.status === "approved").length;
}

/** Would this change leave the app with zero approved admins? */
async function wouldOrphan(
  target: { id: string; role: string; status: string },
  next: { role?: Role; status?: UserStatus },
): Promise<boolean> {
  const wasAdmin = target.role === "admin" && target.status === "approved";
  if (!wasAdmin) return false; // demoting a non-admin can't remove the last admin
  const stillAdmin =
    (next.role ?? target.role) === "admin" &&
    (next.status ?? target.status) === "approved";
  if (stillAdmin) return false;
  return (await approvedAdminCount()) <= 1;
}

async function loadTarget(userId: string) {
  const [target] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return target ?? null;
}

export async function setUserStatus(
  userId: string,
  status: UserStatus,
): Promise<Result> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { error: "Admin access required." };
  if (!STATUSES.includes(status)) return { error: "Invalid status." };

  const target = await loadTarget(userId);
  if (!target) return { error: "User not found." };

  if (await wouldOrphan(target, { status })) {
    return { error: "Can't remove the last admin — promote another admin first." };
  }

  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/users");
  return {};
}

export async function setUserRole(userId: string, role: Role): Promise<Result> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { error: "Admin access required." };
  if (!ROLES.includes(role)) return { error: "Invalid role." };

  const target = await loadTarget(userId);
  if (!target) return { error: "User not found." };

  if (await wouldOrphan(target, { role })) {
    return { error: "Can't remove the last admin — promote another admin first." };
  }

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/users");
  return {};
}
