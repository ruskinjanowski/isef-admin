"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setUserRole, setUserStatus } from "./actions";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "reviewer";
  status: "pending" | "approved" | "disabled";
  createdAt: string;
};

const STATUS_STYLES: Record<Row["status"], string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  disabled: "bg-muted text-muted-foreground",
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (res?.error) toast.error(res.error);
      else toast.success("User updated.");
    });
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No users yet.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">User</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <tr key={u.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {u.name || u.email}
                    {isSelf && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </div>
                  {u.name && (
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      STATUS_STYLES[u.status],
                    )}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {u.status !== "approved" && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => setUserStatus(u.id, "approved"))}
                      >
                        Approve
                      </Button>
                    )}
                    {u.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setUserRole(
                              u.id,
                              u.role === "admin" ? "reviewer" : "admin",
                            ),
                          )
                        }
                      >
                        {u.role === "admin" ? "Make reviewer" : "Make admin"}
                      </Button>
                    )}
                    {u.status !== "disabled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => setUserStatus(u.id, "disabled"))}
                      >
                        {u.status === "pending" ? "Reject" : "Disable"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
