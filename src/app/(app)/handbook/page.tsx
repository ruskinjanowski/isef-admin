import { redirect } from "next/navigation";

import { getCurrentUser, isAdmin } from "@/lib/access";
import { listPages } from "@/lib/handbook/handbook";
import { HandbookEditor } from "./handbook-editor";

// Admin-only. Authors the markdown pages the WhatsApp chatbot answers from. The
// session gate in (app)/layout.tsx guarantees an approved user; this adds the
// admin check, and every mutation re-checks admin server-side (see actions.ts).
export default async function HandbookPage() {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  const pages = await listPages();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Handbook</h1>
        <p className="text-sm text-muted-foreground">
          The process pages the WhatsApp assistant answers from. Write each
          process as its own page; the bot answers strictly from what&apos;s here
          and refers people to a human for anything not covered.
        </p>
      </div>

      <div className="mt-8">
        <HandbookEditor initialPages={pages} />
      </div>
    </main>
  );
}
