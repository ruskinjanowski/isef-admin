"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Mirrors RecalcSummary from src/lib/tiering/recalculate.ts (kept local so the
// client bundle doesn't pull in the server-only module).
type RecalcSummary = {
  candidatesTotal: number;
  screened: number;
  tier1: number;
  tier2: number;
  tier3: number;
  unrankedScreened: number;
  notScreened: number;
};

const SUMMARY_ROWS: { label: string; key: keyof RecalcSummary }[] = [
  { label: "Candidates total", key: "candidatesTotal" },
  { label: "Screened (recomputed)", key: "screened" },
  { label: "Tier 1", key: "tier1" },
  { label: "Tier 2", key: "tier2" },
  { label: "Tier 3", key: "tier3" },
  { label: "Screened but no race (unranked)", key: "unrankedScreened" },
  { label: "Not screened (unranked)", key: "notScreened" },
];

export function RecalculateTiers() {
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<RecalcSummary | null>(null);

  async function handleClick() {
    setPending(true);
    setSummary(null);
    try {
      const res = await fetch("/api/tiers/recalculate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Recalculation failed.");
      }
      const s = json.summary as RecalcSummary;
      setSummary(s);
      toast.success(
        `Tiered ${s.screened} screened candidates ` +
          `(${s.tier1} T1 · ${s.tier2} T2 · ${s.tier3} T3).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recalculation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recalculate tiers</CardTitle>
          <CardDescription>
            Re-derive every candidate&apos;s tier from their profile and
            screening (race + appearance). Only screened candidates can be
            tiered; the rest stay Unranked. Safe to re-run any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleClick} disabled={pending}>
            <Layers className="size-4" />
            {pending ? "Recalculating…" : "Recalculate all tiers"}
          </Button>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Recalculation complete</CardTitle>
            <CardDescription>Summary of the last run.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {SUMMARY_ROWS.map(({ label, key }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{summary[key]}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
