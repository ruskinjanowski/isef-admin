// Tier breakdown — shows, line by line, how a candidate's tier score was
// derived. Recomputed live from the current engine + data, so it always
// reflects the latest rules (the stored tier on `screening` is what the list
// filters on; this page is the explanation).

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { db } from "@/db";
import { candidates } from "@/db/schema";
import { toCandidateView } from "@/lib/candidates/view";
import { getScreening } from "@/lib/screening/screening";
import { computeTier, toTierInputs, tierLabel } from "@/lib/tiering/tiering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TIER_STYLES: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  3: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export default async function TierBreakdownPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [row] = await db
    .select({ id: candidates.id, data: candidates.data })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);

  if (!row) {
    notFound();
  }

  const data = row.data as Record<string, string>;
  const view = toCandidateView({ id: row.id, data });
  const screening = await getScreening(row.id);

  const result = computeTier(
    toTierInputs(data, {
      race: screening.race,
      appearance: screening.appearance,
      manualAdjustment: screening.manualAdjustment,
    }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
      <Link
        href={`/candidates/${row.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {view.fullName || "Candidate"}
      </Link>

      {/* Result */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {view.fullName || "Candidate"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.tier == null ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Unranked.</span>{" "}
                This candidate has no race recorded in screening, so the tier
                rules (which branch on race) can&apos;t be applied. Add screening
                first, then recalculate.
              </p>
            ) : (
              <div className="flex items-baseline gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${TIER_STYLES[result.tier]}`}
                >
                  {tierLabel(result.tier)}
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {result.score}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    / 100
                  </span>
                </span>
                {result.group && (
                  <span className="text-sm text-muted-foreground">
                    scored as{" "}
                    {result.group === "white" ? "white" : "non-white"} group
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Flags */}
        {result.flags.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              {result.flags.map((f) => (
                <p
                  key={f}
                  className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {f}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Line-by-line contributions */}
        {result.breakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How it was scored</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {result.breakdown.map((line, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{line.label}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {line.detail}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {line.points >= 0 ? `+${line.points}` : line.points}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2">
                    <td className="py-2 pr-3 font-semibold" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {result.score}
                    </td>
                  </tr>
                </tbody>
              </table>
              {screening.manualAdjustment != null && screening.notes && (
                <div className="mt-4 rounded-md border border-dashed p-3 text-sm">
                  <span className="font-medium">Manual adjustment reasoning: </span>
                  <span className="text-muted-foreground whitespace-pre-wrap">
                    {screening.notes}
                  </span>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Bands: Tier 1 = 80–100 · Tier 2 = 60–79 · Tier 3 = 1–59. This is
                a heuristic approximation — the score is additive, so no single
                factor is an absolute gate.
              </p>
            </CardContent>
          </Card>
        )}
    </main>
  );
}
