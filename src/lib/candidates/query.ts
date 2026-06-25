// Server-side read path for the candidates list: filter + sort + paginate the
// registration mirror directly in Postgres, so the UI only ever loads one page.
//
// All candidate fields live inside the `data` jsonb column (see src/db/CLAUDE.md
// — the table is a pure mirror, no per-field columns). So every filter/sort here
// reaches into `data ->> '<header>'`. In particular the list is ordered by the
// Google Form submission time, which is the `Timestamp` cell parsed at query
// time — no derived column, no schema change.

import { and, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { candidates, screening } from "@/db/schema";
import { RACE_OPTIONS } from "@/lib/screening/screening";
import {
  COL,
  GRADE_BANDS,
  buildFilterOptions,
  splitCountries,
  toCandidateView,
  type CandidateView,
  type FilterOptions,
} from "./view";

export type CandidateFilters = {
  search: string;
  subject: string;
  nationality: string;
  qualification: string;
  country: string;
  /** Grade band taught (one of GRADE_BANDS), matched against the multi-select cell. */
  grade: string;
  minYears: number;
  gender: string;
  minAge: number;
  maxAge: number;
  /** Screening race (app-state, joined from the `screening` table). */
  race: string;
  /** Minimum screening appearance ordinal 1–5 (app-state, joined). */
  minAppearance: number;
  /** Derived tier: "1" | "2" | "3" | "unranked" | "" (any). */
  tier: string;
};

export const EMPTY_FILTERS: CandidateFilters = {
  search: "",
  subject: "",
  nationality: "",
  qualification: "",
  country: "",
  grade: "",
  minYears: 0,
  gender: "",
  minAge: 0,
  maxAge: 0,
  race: "",
  minAppearance: 0,
  tier: "",
};

/** Candidates shown per page. */
export const PAGE_SIZE = 50;

/** `data ->> '<header>'` — pull a single mirrored form cell out of the jsonb. */
const cell = (header: string) => sql`${candidates.data} ->> ${header}`;

// Registration time = the form `Timestamp` cell ("6/22/2025 20:55:11") parsed to
// a real timestamp. Blank cells become NULL so they sort last under DESC.
const registeredAt = sql`to_timestamp(nullif(${cell(
  COL.registeredAt,
)}, ''), 'MM/DD/YYYY HH24:MI:SS')`;

/** Escape LIKE metacharacters so a search term matches literally. */
function likePattern(q: string): string {
  return "%" + q.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%";
}

/** Translate the UI filter set into a single SQL predicate (or none). */
function buildWhere(f: CandidateFilters): SQL | undefined {
  const conds: SQL[] = [];

  const q = f.search.trim();
  if (q) {
    // Match the view's search haystack: name parts + email + phone.
    const haystack = sql`lower(concat_ws(' ', ${cell(COL.firstName)}, ${cell(
      COL.lastName,
    )}, ${cell(COL.fullName)}, ${cell(COL.email)}, ${cell(COL.contact)}))`;
    conds.push(sql`${haystack} like ${likePattern(q)}`);
  }
  if (f.subject) conds.push(sql`${cell(COL.subject)} = ${f.subject}`);
  if (f.nationality)
    conds.push(sql`${cell(COL.nationality)} = ${f.nationality}`);
  if (f.qualification)
    conds.push(sql`${cell(COL.qualification)} = ${f.qualification}`);
  if (f.country) {
    // The cell is a "Qatar, Saudi Arabia" combo; match one trimmed token exactly.
    conds.push(
      sql`exists (select 1 from unnest(string_to_array(${cell(
        COL.countries,
      )}, ',')) as token where btrim(token) = ${f.country})`,
    );
  }
  if (f.grade) {
    // The cell is a "Grade 6 to Grade 8, Grade 9 to Grade 12" multi-select; match
    // one trimmed band exactly (same shape as the country combo above).
    conds.push(
      sql`exists (select 1 from unnest(string_to_array(${cell(
        COL.grades,
      )}, ',')) as token where btrim(token) = ${f.grade})`,
    );
  }
  if (f.minYears > 0) {
    // "15+" / "8 years" → leading integer; NULL (no digits) fails the compare.
    conds.push(
      sql`(substring(${cell(COL.years)} from '[0-9]+'))::int >= ${f.minYears}`,
    );
  }
  if (f.gender) conds.push(sql`${cell(COL.gender)} = ${f.gender}`);
  // Age cells are clean integers; pull the leading digits and compare. A blank
  // or non-numeric cell yields NULL and falls out of either bound.
  const age = sql`(substring(${cell(COL.age)} from '[0-9]+'))::int`;
  if (f.minAge > 0) conds.push(sql`${age} >= ${f.minAge}`);
  if (f.maxAge > 0) conds.push(sql`${age} <= ${f.maxAge}`);
  // race / appearance come from the joined screening table (app-state).
  if (f.race) conds.push(sql`${screening.race} = ${f.race}`);
  if (f.minAppearance > 0)
    conds.push(sql`${screening.appearance} >= ${f.minAppearance}`);
  if (f.tier === "unranked") conds.push(sql`${screening.tier} is null`);
  else if (f.tier) conds.push(sql`${screening.tier} = ${Number(f.tier)}`);

  return conds.length ? and(...conds) : undefined;
}

/**
 * A candidate mirror view plus the reviewer screening fields the list filters
 * on. Screening is app-state in its own table; it's `null` for unscreened
 * candidates (left join). Kept separate from {@link CandidateView} so the mirror
 * projection stays free of app-state (see src/db/CLAUDE.md).
 */
export type CandidateListItem = CandidateView & {
  race: string | null;
  appearance: number | null;
  /** Derived tier 1–3, or null = Unranked. */
  tier: number | null;
};

export type CandidatePage = {
  /** This page's candidates, already sorted latest-registered first. */
  views: CandidateListItem[];
  /** Total matching the filters (across all pages), for the page count. */
  total: number;
};

/** Fetch one page of candidates matching `filters`, newest registration first. */
export async function queryCandidatesPage(
  filters: CandidateFilters,
  page: number,
): Promise<CandidatePage> {
  const where = buildWhere(filters);
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  // Left join screening (one row per candidate, unique FK — never multiplies
  // rows) so race/appearance are both filterable and displayable in one pass.
  const join = eq(screening.candidateId, candidates.id);

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: candidates.id,
        data: candidates.data,
        race: screening.race,
        appearance: screening.appearance,
        tier: screening.tier,
      })
      .from(candidates)
      .leftJoin(screening, join)
      .where(where)
      .orderBy(sql`${registeredAt} desc nulls last`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .leftJoin(screening, join)
      .where(where),
  ]);

  const views = rows.map((r) => ({
    ...toCandidateView({ id: r.id, data: r.data as Record<string, string> }),
    race: r.race,
    appearance: r.appearance,
    tier: r.tier,
  }));
  return { views, total: counted[0]?.count ?? 0 };
}

/**
 * Distinct dropdown values across the *whole* table. Reads only the few cells
 * the filters need (not every row's full `data`), so it stays cheap.
 */
export async function queryFilterOptions(): Promise<FilterOptions> {
  const rows = await db
    .select({
      subject: sql<string>`coalesce(${cell(COL.subject)}, '')`,
      nationality: sql<string>`coalesce(${cell(COL.nationality)}, '')`,
      qualification: sql<string>`coalesce(${cell(COL.qualification)}, '')`,
      countries: sql<string>`coalesce(${cell(COL.countries)}, '')`,
      gender: sql<string>`coalesce(${cell(COL.gender)}, '')`,
    })
    .from(candidates);

  return {
    ...buildFilterOptions(
      rows.map((r) => ({
        subject: r.subject,
        nationality: r.nationality,
        qualification: r.qualification,
        countries: splitCountries(r.countries),
        gender: r.gender,
      })),
    ),
    // race is a fixed screening set, not derived from the mirror data.
    races: RACE_OPTIONS,
    // grades is the form's fixed multi-select band list (see GRADE_BANDS).
    grades: GRADE_BANDS,
  };
}
