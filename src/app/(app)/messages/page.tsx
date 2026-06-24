import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUser, isAdmin } from "@/lib/access";
import { listRecentMessages } from "@/lib/whatsapp/messages";

// Admin-only WhatsApp message log. The session gate in (app)/layout.tsx already
// guarantees an approved user; this adds the admin check (sends are admin-only,
// so is viewing the send history). Read-only view of the `wa_messages` log.
export default async function MessagesPage() {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  const messages = await listRecentMessages(200);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp send log, newest first. Every template send (and its outcome)
          is recorded here.
        </p>
      </div>

      <div className="mt-6 overflow-auto rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <Th>When</Th>
              <Th>Candidate</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id} className="border-b last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {m.createdAt.toLocaleString("en-US")}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/candidates/${m.candidateId}`}
                    className="font-medium hover:underline"
                  >
                    {m.candidateName || "—"}
                  </Link>
                </td>
                <td className="px-3 py-2">{m.templateName || "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {m.status === "failed" ? m.error || "—" : ""}
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No messages sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b bg-muted px-3 py-2 font-medium">{children}</th>
  );
}

/** Colour-coded delivery status. */
function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "failed"
      ? "text-red-600 dark:text-red-400"
      : status === "sent" || status === "delivered" || status === "read"
        ? "text-green-600 dark:text-green-400"
        : "text-muted-foreground";
  return <span className={`font-medium capitalize ${tone}`}>{status}</span>;
}
