import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileText, Mail, Phone } from "lucide-react";

import { db } from "@/db";
import { candidates } from "@/db/schema";
import { toCandidateView } from "@/lib/candidates/view";
import { driveThumbnailUrl } from "@/lib/candidates/drive";
import { getScreening } from "@/lib/screening/screening";
import { computeTier, toTierInputs, tierLabel } from "@/lib/tiering/tiering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DriveImage } from "./drive-image";
import { ScreeningForm } from "./screening-form";

// Headers surfaced in the header/documents cards — skipped in the full dump so
// they aren't shown twice.
const SURFACED = new Set([
  "First Name(s)",
  "Last Name",
  "Full Name",
  "Email Address",
  "WhatsApp Number",
  "Professional Photo",
  "Which position are you applying for?",
  "Nationality",
  "Current Location",
  "Resume / CV Upload",
  "Cover Letter Upload",
]);

const PHOTO_COL = "Professional Photo";
const CV_COL = "Resume / CV Upload";
const COVER_COL = "Cover Letter Upload";

const TIER_STYLES: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  3: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

const isUrl = (v: string) => /^https?:\/\//i.test(v);
const isLong = (v: string) => v.length > 120 || v.includes("\n");

export default async function CandidateDetailPage({
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

  // Tier is recomputed live (same as the breakdown page) so the two never drift.
  const tierResult = computeTier(
    toTierInputs(data, {
      race: screening.race,
      appearance: screening.appearance,
      manualAdjustment: screening.manualAdjustment,
    }),
  );

  const photoUrl = (data[PHOTO_COL] ?? "").trim();
  const cvUrl = (data[CV_COL] ?? "").trim();
  const coverUrl = (data[COVER_COL] ?? "").trim();

  // Everything not surfaced above, in original sheet order.
  const fields = Object.entries(data).filter(
    ([key, value]) => !SURFACED.has(key) && value.trim() !== "",
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Candidates
      </Link>

      {/* Header: photo + identity */}
        <Card>
          <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row">
            <DriveImage
              thumbnailUrl={driveThumbnailUrl(photoUrl, 400)}
              viewUrl={photoUrl}
              alt={view.fullName}
            />
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {view.fullName || "—"}
                  </h1>
                  {view.position && (
                    <p className="text-muted-foreground">{view.position}</p>
                  )}
                </div>
                <Link
                  href={`/candidates/${row.id}/tier`}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors hover:border-primary"
                  title="View tier breakdown"
                >
                  {tierResult.tier == null ? (
                    <span className="font-medium text-muted-foreground">
                      Unranked
                    </span>
                  ) : (
                    <>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[tierResult.tier]}`}
                      >
                        {tierLabel(tierResult.tier)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {tierResult.score}
                        <span className="font-normal text-muted-foreground">
                          /100
                        </span>
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground">→</span>
                </Link>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Fact label="Subject">{view.subject}</Fact>
                <Fact label="Nationality">{view.nationality}</Fact>
                <Fact label="Experience">{view.yearsRaw}</Fact>
                <Fact label="Location">{view.location}</Fact>
                <Fact label="Qualification">{view.qualification}</Fact>
                <Fact label="Registered">{view.registeredAt}</Fact>
              </dl>
              <div className="flex flex-wrap gap-3 pt-1 text-sm">
                {view.email && (
                  <a
                    href={`mailto:${view.email}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Mail className="size-4" />
                    {view.email}
                  </a>
                )}
                {view.contact && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Phone className="size-4" />
                    {view.contact}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <DocLink href={cvUrl} label="Resume / CV" />
            <DocLink href={coverUrl} label="Cover Letter" />
            <DocLink href={photoUrl} label="Professional Photo" />
          </CardContent>
        </Card>

        {/* Screening (app-state, editable) */}
        <ScreeningForm candidateId={row.id} initial={screening} />

        {/* All remaining registration fields, in sheet order */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registration details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {fields.map(([key, value]) => (
                <div
                  key={key}
                  className={isLong(value) ? "sm:col-span-2" : undefined}
                >
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                    {isUrl(value) ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                      >
                        {value}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
    </main>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium">{children || "—"}</dd>
    </div>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <FileText className="size-4" />
        {label} — none
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary hover:text-primary"
    >
      <FileText className="size-4" />
      {label}
      <ExternalLink className="size-3.5" />
    </a>
  );
}
