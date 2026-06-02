import { redirect } from "next/navigation";

import { getCurrentUser, isAdmin } from "@/lib/access";
import { ImportForm } from "./import-form";
import { RecalculateTiers } from "./recalculate-tiers";

export default async function ImportPage() {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Import candidates
          </h1>
          <p className="text-sm text-muted-foreground">
            One-time CSV load of the source data into Postgres. The future Sync
            button reuses the same logic against the live sheet.
          </p>
        </div>

      <div className="mt-8 space-y-10">
        <ImportForm />
        <RecalculateTiers />
      </div>
    </main>
  );
}
