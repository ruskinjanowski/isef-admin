"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FilterOptions } from "@/lib/candidates/view";
import type {
  CandidateFilters,
  CandidateListItem,
} from "@/lib/candidates/query";
import {
  APPEARANCE_LEVELS,
  APPEARANCE_MAX,
  appearanceLabel,
} from "@/lib/screening/appearance";

const YEAR_THRESHOLDS = [0, 1, 2, 3, 5, 10, 15];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CandidatesTable({
  candidates,
  options,
  filters,
  page,
  pageCount,
  total,
  pageSize,
  templates,
}: {
  candidates: CandidateListItem[];
  options: FilterOptions;
  filters: CandidateFilters;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** WhatsApp templates available to send (key + display label). */
  templates: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filtering and paging live in the URL — the server reads it and returns the
  // matching page. `navigate` patches the query string; any change other than
  // `page` itself drops back to page 1 so you don't land on an empty page.
  const navigate = (updates: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!("page" in updates)) params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "" || value === 0) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Free-text search is debounced: type freely, push `q` after a short pause.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput.trim() !== filters.search) navigate({ q: searchInput });
    }, 300);
    return () => clearTimeout(id);
    // We only want to react to the user's typing; navigate reads the latest
    // searchParams at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Age is a free range, so it's two text inputs committed on blur / Enter
  // rather than per-keystroke — one navigation instead of one per digit.
  const [minAge, setMinAge] = useState(filters.minAge ? String(filters.minAge) : "");
  const [maxAge, setMaxAge] = useState(filters.maxAge ? String(filters.maxAge) : "");
  const commitAge = () =>
    navigate({ minAge: Number(minAge) || 0, maxAge: Number(maxAge) || 0 });

  const hasFilters =
    filters.search !== "" ||
    filters.subject !== "" ||
    filters.nationality !== "" ||
    filters.qualification !== "" ||
    filters.country !== "" ||
    filters.minYears > 0 ||
    filters.gender !== "" ||
    filters.minAge > 0 ||
    filters.maxAge > 0 ||
    filters.race !== "" ||
    filters.minAppearance > 0 ||
    filters.tier !== "";

  const clearFilters = () => {
    setSearchInput("");
    setMinAge("");
    setMaxAge("");
    router.push(pathname);
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = start === 0 ? 0 : start + candidates.length - 1;

  // ── Selection + WhatsApp send ───────────────────────────────────────────────
  // Selection is by candidate id and lives in client state, so it PERSISTS as
  // you page/filter (paging is a soft navigation that re-renders the server
  // page without remounting this component). "Select all" only ever touches the
  // current page's rows; the running total can span pages.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const pageIds = useMemo(() => candidates.map((c) => c.id), [candidates]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  const clearSelection = () => {
    setSelected(new Set());
    setConfirming(false);
  };

  const selectedTemplate = templates.find((t) => t.key === templateKey);

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: [...selected],
          templateKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not send messages.");

      const { sent, failed } = json as {
        sent: number;
        failed: number;
        outcomes: { candidateName: string; status: string; error?: string }[];
      };
      if (failed > 0) {
        const reasons = (json.outcomes as { status: string; candidateName: string; error?: string }[])
          .filter((o) => o.status === "failed")
          .slice(0, 3)
          .map((o) => `${o.candidateName}: ${o.error ?? "failed"}`)
          .join("\n");
        toast.warning(`Sent ${sent}, ${failed} failed.`, {
          description: reasons,
        });
      } else {
        toast.success(`Sent to ${sent} candidate${sent === 1 ? "" : "s"}.`);
      }
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <select
          className={selectClass}
          value={filters.subject}
          onChange={(e) => navigate({ subject: e.target.value })}
        >
          <option value="">All subjects</option>
          {options.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.minYears}
          onChange={(e) => navigate({ minYears: Number(e.target.value) })}
        >
          {YEAR_THRESHOLDS.map((y) => (
            <option key={y} value={y}>
              {y === 0 ? "Any experience" : `${y}+ years`}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.country}
          onChange={(e) => navigate({ country: e.target.value })}
        >
          <option value="">Any country preference</option>
          {options.countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.qualification}
          onChange={(e) => navigate({ qualification: e.target.value })}
        >
          <option value="">All qualifications</option>
          {options.qualifications.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.nationality}
          onChange={(e) => navigate({ nationality: e.target.value })}
        >
          <option value="">All nationalities</option>
          {options.nationalities.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.gender}
          onChange={(e) => navigate({ gender: e.target.value })}
        >
          <option value="">All genders</option>
          {options.genders.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min age"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            onBlur={commitAge}
            onKeyDown={(e) => e.key === "Enter" && commitAge()}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max age"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            onBlur={commitAge}
            onKeyDown={(e) => e.key === "Enter" && commitAge()}
          />
        </div>

        <select
          className={selectClass}
          value={filters.race}
          onChange={(e) => navigate({ race: e.target.value })}
        >
          <option value="">Any race</option>
          {options.races.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.minAppearance}
          onChange={(e) => navigate({ minAppearance: Number(e.target.value) })}
        >
          <option value={0}>Any appearance</option>
          {APPEARANCE_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.value === APPEARANCE_MAX
                ? level.label
                : `${level.label} or better`}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.tier}
          onChange={(e) => navigate({ tier: e.target.value })}
        >
          <option value="">Any tier</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
          <option value="unranked">Unranked</option>
        </select>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total.toLocaleString("en-US")} {hasFilters ? "matching " : ""}candidates
          {total > 0 &&
            ` · showing ${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")}`}
        </span>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7"
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Send bar — appears once anything is selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">
            {selected.size.toLocaleString("en-US")} selected
          </span>
          {!confirming ? (
            <>
              <div className="w-64">
                <select
                  className={selectClass}
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  disabled={sending}
                >
                  {templates.length === 0 && (
                    <option value="">No templates available</option>
                  )}
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={!templateKey || sending}
              >
                <Send className="size-4" />
                Send WhatsApp
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={sending}
              >
                Clear
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">
                Send “{selectedTemplate?.label}” to{" "}
                {selected.size.toLocaleString("en-US")} candidate
                {selected.size === 1 ? "" : "s"}? This can’t be undone.
              </span>
              <Button size="sm" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sending ? "Sending…" : "Confirm send"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky top-0 z-10 w-10 border-b bg-muted px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all candidates on this page"
                  checked={allPageSelected}
                  onChange={toggleAllPage}
                  className="size-4 cursor-pointer accent-primary align-middle"
                />
              </th>
              <Th>Name</Th>
              <Th>Tier</Th>
              <Th>Nationality</Th>
              <Th>Gender</Th>
              <Th className="text-right">Age</Th>
              <Th>Subject</Th>
              <Th>Qualification</Th>
              <Th className="text-right">Years</Th>
              <Th>Location</Th>
              <Th>Country pref.</Th>
              <Th>Race</Th>
              <Th>Appearance</Th>
              <Th>Registered</Th>
              <Th>CV</Th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.id}
                onClick={(e) => {
                  // Honor the usual "new tab" gestures: cmd/ctrl-click opens in
                  // a background tab, plain click navigates in place.
                  if (e.metaKey || e.ctrlKey) {
                    window.open(`/candidates/${c.id}`, "_blank");
                  } else {
                    router.push(`/candidates/${c.id}`);
                  }
                }}
                onAuxClick={(e) => {
                  // Middle-click → new tab.
                  if (e.button === 1) {
                    window.open(`/candidates/${c.id}`, "_blank");
                  }
                }}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td
                  className="px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.fullName || c.email}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="size-4 cursor-pointer accent-primary align-middle"
                  />
                </td>
                <td className="px-3 py-2">
                  {/* Real link so right-click → "Open in new tab" works. */}
                  <Link
                    href={`/candidates/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium hover:underline"
                  >
                    {c.fullName || "—"}
                  </Link>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </td>
                <td className="px-3 py-2">
                  <TierBadge tier={c.tier} id={c.id} />
                </td>
                <td className="px-3 py-2">{c.nationality || "—"}</td>
                <td className="px-3 py-2">{c.gender || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.age ?? "—"}
                </td>
                <td className="px-3 py-2">{c.subject || "—"}</td>
                <td className="px-3 py-2">{c.qualification || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.yearsRaw || "—"}
                </td>
                <td className="px-3 py-2">{c.location || "—"}</td>
                <td className="px-3 py-2">
                  {c.countries.length ? c.countries.join(", ") : "—"}
                </td>
                <td className="px-3 py-2 capitalize">{c.race || "—"}</td>
                <td className="px-3 py-2">
                  {appearanceLabel(c.appearance) ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {c.registeredAt || "—"}
                </td>
                <td className="px-3 py-2">
                  {c.cvUrl ? (
                    <a
                      href={c.cvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center text-primary hover:underline"
                      title="Open CV"
                    >
                      <FileText className="size-4" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No candidates match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page.toLocaleString("en-US")} of {pageCount.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => navigate({ page: page - 1 })}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => navigate({ page: page + 1 })}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-10 border-b bg-muted px-3 py-2 font-medium ${className}`}
    >
      {children}
    </th>
  );
}

/** Just the tier number, linking to the breakdown. Dash when unranked. */
function TierBadge({ tier, id }: { tier: number | null; id: string }) {
  if (tier == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Link
      href={`/candidates/${id}/tier`}
      onClick={(e) => e.stopPropagation()}
      className="font-medium text-primary tabular-nums hover:underline"
      title="View tier breakdown"
    >
      {tier}
    </Link>
  );
}
