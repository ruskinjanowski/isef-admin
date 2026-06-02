// Central access control. Two questions, two fields (see users table in
// src/db/schema.ts):
//   • status — may this account use the app at all? (pending → approved → disabled)
//   • role   — what may it do once approved? (admin unlocks privileged actions)
//
// Every gate in the app funnels through here so the rules live in one place:
// the app layout redirects (UI), Route Handlers return Responses (API), and
// Server Actions throw. Never trust the UI alone — guard the data layer too.

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export type Role = "admin" | "reviewer";
export type UserStatus = "pending" | "approved" | "disabled";

export type AccessUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
};

/** The signed-in user (with role/status), or null if there's no session. */
export async function getCurrentUser(): Promise<AccessUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return session.user as unknown as AccessUser;
}

export function isApproved(user: AccessUser): boolean {
  return user.status === "approved";
}

export function isAdmin(user: AccessUser): boolean {
  return user.role === "admin" && user.status === "approved";
}

/**
 * Authorize a Route Handler. Returns the user on success, or a ready-to-return
 * Response (401 no session, 403 not approved, 403 not admin) on failure:
 *
 *   const access = await authorize({ admin: true });
 *   if (!access.ok) return access.response;
 *   // …use access.user
 */
export async function authorize(
  opts: { admin?: boolean } = {},
): Promise<
  { ok: true; user: AccessUser } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isApproved(user)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Your account is pending approval." },
        { status: 403 },
      ),
    };
  }
  if (opts.admin && user.role !== "admin") {
    return {
      ok: false,
      response: Response.json(
        { error: "Admin access required." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user };
}
