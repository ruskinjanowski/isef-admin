"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createHandbookPage,
  deleteHandbookPage,
  updateHandbookPage,
} from "./actions";

import "@uiw/react-md-editor/markdown-editor.css";

// The editor touches `document` on load, so pull it in client-only.
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

// Mirrors HandbookPage from src/lib/handbook (kept local so the client bundle
// doesn't pull in the server-only module).
type Page = {
  id: string;
  title: string;
  content: string;
  position: number;
  updatedAt: string;
};

export function HandbookEditor({ initialPages }: { initialPages: Page[] }) {
  const { resolvedTheme } = useTheme();
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPages[0]?.id ?? null,
  );
  const [newTitle, setNewTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? null,
    [pages, selectedId],
  );

  // Draft fields for the selected page. Re-seeded at render time (not in an
  // effect) whenever the selection changes — React's recommended pattern for
  // resetting state in response to a prop/state change.
  const [draftTitle, setDraftTitle] = useState(selected?.title ?? "");
  const [draftContent, setDraftContent] = useState(selected?.content ?? "");
  const [seededFor, setSeededFor] = useState(selectedId);
  if (seededFor !== selectedId) {
    setSeededFor(selectedId);
    setDraftTitle(selected?.title ?? "");
    setDraftContent(selected?.content ?? "");
  }

  const dirty =
    selected != null &&
    (draftTitle !== selected.title || draftContent !== selected.content);

  function selectPage(id: string) {
    if (id === selectedId) return;
    if (dirty && !confirm("Discard unsaved changes to this page?")) return;
    setSelectedId(id);
  }

  function addPage(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createHandbookPage(title);
      if (res.error || !res.page) {
        toast.error(res.error ?? "Could not create page.");
        return;
      }
      setPages((prev) => [...prev, res.page!]);
      setSelectedId(res.page.id);
      setNewTitle("");
      toast.success("Page created.");
    });
  }

  function save() {
    if (!selected) return;
    const title = draftTitle.trim();
    if (!title) {
      toast.error("Title is required.");
      return;
    }
    startTransition(async () => {
      const res = await updateHandbookPage(selected.id, {
        title,
        content: draftContent,
      });
      if (res.error || !res.page) {
        toast.error(res.error ?? "Could not save page.");
        return;
      }
      const saved = res.page;
      setPages((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      toast.success("Page saved.");
    });
  }

  function remove() {
    if (!selected) return;
    if (!confirm(`Delete “${selected.title}”? This can't be undone.`)) return;
    const id = selected.id;
    startTransition(async () => {
      const res = await deleteHandbookPage(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPages((prev) => {
        const next = prev.filter((p) => p.id !== id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
      toast.success("Page deleted.");
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* Page list + new-page form */}
      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border">
          {pages.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No pages yet. Add your first one below.
            </p>
          ) : (
            <ul className="divide-y">
              {pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPage(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                      p.id === selectedId && "bg-muted font-medium",
                    )}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={addPage} className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={pending}
            placeholder="New page title"
            aria-label="New page title"
          />
          <Button type="submit" size="icon" disabled={pending || !newTitle.trim()}>
            <Plus className="size-4" />
            <span className="sr-only">Add page</span>
          </Button>
        </form>
      </div>

      {/* Editor pane */}
      {selected ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="page-title">Page title</Label>
            <Input
              id="page-title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              disabled={pending}
              placeholder="e.g. Visa application"
            />
          </div>

          <div data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}>
            <MDEditor
              value={draftContent}
              onChange={(val) => setDraftContent(val ?? "")}
              height={460}
              textareaProps={{
                placeholder:
                  "Write this process in plain language — the bot can only answer what's written here.",
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" onClick={save} disabled={pending || !dirty}>
              <Save className="size-4" />
              {pending ? "Saving…" : dirty ? "Save page" : "Saved"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={remove}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[20rem] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Select a page to edit, or add a new one.
        </div>
      )}
    </div>
  );
}
