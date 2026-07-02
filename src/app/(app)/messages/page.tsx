import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUser, isAdmin } from "@/lib/access";
import { listConversations } from "@/lib/whatsapp/messages";

const PAGE_SIZE = 20;

// Admin-only WhatsApp conversation list — every phone-keyed thread, both
// outbound template sends and inbound/bot replies (they share one
// conversation per number), most recently active first. Paginated 20 at a
// time since this can grow into the hundreds. Links into the thread view.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) {
    redirect("/");
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { items: conversations, total } = await listConversations({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp conversations, most recently active first. Every template
          send and reply threads together by phone number.
        </p>
      </div>

      <div className="mt-6 divide-y rounded-lg border">
        {conversations.map((c) => (
          <Link
            key={c.id}
            href={`/messages/${c.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <div className="font-medium">
                {c.candidateName || formatPhone(c.waPhone)}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {c.lastMessageDirection === "out" ? "You: " : ""}
                {c.lastMessageBody || "—"}
              </div>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {c.lastMessageAt?.toLocaleString("en-US") ?? ""}
            </div>
          </Link>
        ))}
        {conversations.length === 0 && (
          <div className="px-4 py-10 text-center text-muted-foreground">
            No conversations yet.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <PageLink page={page - 1} disabled={page <= 1}>
            ← Previous
          </PageLink>
          <span>
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages}>
            Next →
          </PageLink>
        </div>
      )}
    </main>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="opacity-40">{children}</span>;
  }
  return (
    <Link href={`/messages?page=${page}`} className="hover:underline">
      {children}
    </Link>
  );
}

/** "27655920899" -> "+27655920899" for display. */
function formatPhone(waPhone: string): string {
  return `+${waPhone}`;
}
