import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser, isAdmin } from "@/lib/access";
import {
  getConversation,
  getConversationMessages,
} from "@/lib/whatsapp/messages";

// Admin-only Phase 2 thread view — a single conversation's messages rendered
// as a WhatsApp-style bubble chat (bot/business right, contact left).
// Read-only: no reply composer (manual replies are handled from the human
// business number, outside this app — see src/lib/whatsapp/CLAUDE.md).
export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    notFound();
  }

  const messages = await getConversationMessages(id);
  const windowOpen =
    conversation.windowExpiresAt != null &&
    conversation.windowExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10">
      <div className="space-y-1">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          All conversations
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            {conversation.candidateName && conversation.candidateId ? (
              <Link
                href={`/candidates/${conversation.candidateId}`}
                className="hover:underline"
              >
                {conversation.candidateName}
              </Link>
            ) : (
              conversation.candidateName || `+${conversation.waPhone}`
            )}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              windowOpen
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {windowOpen ? "24h window open" : "24h window closed"}
          </span>
        </div>
        {conversation.candidateName && (
          <p className="text-sm text-muted-foreground">
            +{conversation.waPhone}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {messages.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            No messages in this conversation yet.
          </div>
        )}
      </div>
    </main>
  );
}

function Bubble({
  message,
}: {
  message: { direction: "in" | "out"; body: string | null; createdAt: Date };
}) {
  const fromContact = message.direction === "in";
  return (
    <div className={`flex ${fromContact ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
          fromContact
            ? "bg-background border rounded-bl-sm"
            : "bg-green-600 text-white rounded-br-sm"
        }`}
      >
        <div>{message.body || "—"}</div>
        <div
          className={`mt-1 text-right text-[10px] ${
            fromContact ? "text-muted-foreground" : "text-green-100"
          }`}
        >
          {message.createdAt.toLocaleString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}
