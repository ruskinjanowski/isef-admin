import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  queryCandidatesPage,
  queryFilterOptions,
  type CandidateFilters,
} from "@/lib/candidates/query";
import { WA_TEMPLATES } from "@/lib/whatsapp/templates";
import { CandidatesTable } from "./candidates-table";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const str = (key: string) => (typeof sp[key] === "string" ? sp[key] : "");
  const filters: CandidateFilters = {
    ...EMPTY_FILTERS,
    search: str("q"),
    subject: str("subject"),
    nationality: str("nationality"),
    qualification: str("qualification"),
    country: str("country"),
    minYears: Number(str("minYears")) || 0,
    gender: str("gender"),
    minAge: Number(str("minAge")) || 0,
    maxAge: Number(str("maxAge")) || 0,
    race: str("race"),
    minAppearance: Number(str("minAppearance")) || 0,
    tier: str("tier"),
  };
  const page = Math.max(1, Number(str("page")) || 1);

  const [{ views, total }, options] = await Promise.all([
    queryCandidatesPage(filters, page),
    queryFilterOptions(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="text-sm text-muted-foreground">
          Candidates from the registration form, newest first. Filter to find a
          match — pipeline status, tier and interview data come next.
        </p>
      </div>

      <div className="mt-6">
        <CandidatesTable
          candidates={views}
          options={options}
          filters={filters}
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={PAGE_SIZE}
          templates={WA_TEMPLATES.map((t) => ({ key: t.key, label: t.label }))}
        />
      </div>
    </main>
  );
}
