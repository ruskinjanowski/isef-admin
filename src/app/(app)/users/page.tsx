import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/access";
import { UsersTable } from "./users-table";

// Admin-only. Approve / disable accounts and assign roles. The session gate in
// (app)/layout.tsx already guarantees an approved user; this adds the admin
// check, and every mutation re-checks admin server-side (see actions.ts).
export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Approve new sign-ups and manage access. New accounts start{" "}
          <span className="font-medium">pending</span> and can&apos;t use the app
          until approved here.
        </p>
      </div>

      <div className="mt-8">
        <UsersTable
          users={rows.map((u) => ({
            ...u,
            role: u.role as "admin" | "reviewer",
            status: u.status as "pending" | "approved" | "disabled",
            createdAt: u.createdAt.toISOString(),
          }))}
          currentUserId={me.id}
        />
      </div>
    </main>
  );
}
