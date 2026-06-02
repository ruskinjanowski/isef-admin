import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  advanced: {
    database: {
      // `users.id` is a Postgres uuid with a DB default — let the database
      // generate it. Other models keep app-generated string ids.
      generateId: (options) => {
        if (options.model === "user" || options.model === "users") {
          return false;
        }
        return crypto.randomUUID();
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  // Email + password to start. Google social login is intentionally off for now
  // (see CLAUDE.md) and is trivial to add under `socialProviders` later.
  emailAndPassword: {
    enabled: true,
  },
  // Expose our access-control columns on the session user. `input: false` means
  // a sign-up request can NEVER set its own role/status — they're server-owned.
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "reviewer",
        input: false,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "pending",
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Bootstrap: the very first account becomes an approved admin, so there
        // is always someone who can approve everyone else. Every later sign-up
        // starts pending/reviewer and is inert until an admin approves it.
        before: async (user) => {
          const [row] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(users);
          const isFirstUser = (row?.count ?? 0) === 0;
          return {
            data: {
              ...user,
              role: isFirstUser ? "admin" : "reviewer",
              status: isFirstUser ? "approved" : "pending",
            },
          };
        },
      },
    },
  },
});
