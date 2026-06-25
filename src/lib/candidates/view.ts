// Read-side projection: turns a mirrored candidate row (`candidates.data`, the
// raw form cells) into a clean view model for the UI. Pure and lossless-leaning
// — it derives display fields from the messy sheet headers without mutating the
// mirror. App-state fields (status, tier, interview score) are intentionally
// absent; they'll come from their own tables (see src/db/CLAUDE.md).

/** Source sheet headers we read from. Keep these in one place. */
export const COL = {
  firstName: "First Name(s)",
  lastName: "Last Name",
  fullName: "Full Name",
  email: "Email Address",
  contact: "WhatsApp Number",
  gender: "Gender",
  age: "What is your current age?",
  nationality: "Nationality",
  location: "Current Location",
  position: "Which position are you applying for?",
  subject: "Please indicate your speciality:",
  grades: "What grades have you taught?",
  qualification: "Highest Qualification",
  certification: "Teaching Certification",
  years: "Years teaching?",
  countries: "Which countries are you interested in?",
  availability: "When are you available to start?",
  registeredAt: "Timestamp",
  cvUrl: "Resume / CV Upload",
  photoUrl: "Professional Photo",
} as const;

/**
 * The fixed set of grade bands the form offers as a multi-select (the `grades`
 * cell is a comma-joined subset of these, e.g. "Grade 6 to Grade 8, Grade 9 to
 * Grade 12"). Not derived from the data — it's a closed checkbox list, so we
 * pin it here in natural school order (youngest → oldest) for a stable filter
 * dropdown. New form options, if ever added, must be appended here.
 */
export const GRADE_BANDS = [
  "ECD to Pre-Kindergarten",
  "Kindergarten to Grade 2",
  "Grade 3 to Grade 5",
  "Grade 6 to Grade 8",
  "Grade 9 to Grade 12",
] as const;

export type CandidateView = {
  id: string;
  fullName: string;
  email: string;
  contact: string;
  /** Self-reported gender, free text from the form ("Male" / "Female" / …). */
  gender: string;
  /** Self-reported age parsed to a number, or null if unparseable. */
  age: number | null;
  nationality: string;
  location: string;
  position: string;
  /** Subject specialisation. */
  subject: string;
  grades: string;
  qualification: string;
  /** Teaching certification / license, free text. */
  certification: string;
  /** Years of experience parsed to a number ("15+" → 15), or null if unparseable. */
  years: number | null;
  /** The original years cell, for display when parsing is lossy. */
  yearsRaw: string;
  /** GCC countries the candidate is interested in, split from the combo cell. */
  countries: string[];
  availability: string;
  /** Registration date (the form Timestamp), ISO date or "". */
  registeredAt: string;
  cvUrl: string;
  photoUrl: string;
};

/** A candidate row as stored: app id + the raw mirrored cells. */
export type CandidateRow = { id: string; data: Record<string, string> };

const get = (data: Record<string, string>, key: string) =>
  (data[key] ?? "").trim();

/** Parse a free-text years cell to a number. "15+" → 15, "0" → 0, junk → null. */
export function parseYears(raw: string): number | null {
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Split the "Qatar, Saudi, UAE" combo cell into trimmed country tokens. */
export function splitCountries(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Registration timestamp ("6/22/2025 20:55:11") → ISO date "2025-06-22". */
function toIsoDate(raw: string): string {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function toCandidateView(row: CandidateRow): CandidateView {
  const d = row.data;
  const first = get(d, COL.firstName);
  const last = get(d, COL.lastName);
  const fullName = get(d, COL.fullName) || [first, last].filter(Boolean).join(" ");
  const yearsRaw = get(d, COL.years);

  return {
    id: row.id,
    fullName,
    email: get(d, COL.email),
    contact: get(d, COL.contact),
    gender: get(d, COL.gender),
    // The age cell is a clean integer ("37"); parse defensively all the same.
    age: parseYears(get(d, COL.age)),
    nationality: get(d, COL.nationality),
    location: get(d, COL.location),
    position: get(d, COL.position),
    subject: get(d, COL.subject),
    grades: get(d, COL.grades),
    qualification: get(d, COL.qualification),
    certification: get(d, COL.certification),
    years: parseYears(yearsRaw),
    yearsRaw,
    countries: splitCountries(get(d, COL.countries)),
    availability: get(d, COL.availability),
    registeredAt: toIsoDate(get(d, COL.registeredAt)),
    cvUrl: get(d, COL.cvUrl),
    photoUrl: get(d, COL.photoUrl),
  };
}

export type FilterOptions = {
  subjects: string[];
  nationalities: string[];
  qualifications: string[];
  countries: string[];
  genders: string[];
  /** Allowed screening race values (a fixed set, not derived from the data). */
  races: readonly string[];
  /** Grade bands the form offers (a fixed set — see {@link GRADE_BANDS}). */
  grades: readonly string[];
};

/** The fields {@link buildFilterOptions} reads — a subset of {@link CandidateView}. */
type FilterSource = Pick<
  CandidateView,
  "subject" | "nationality" | "qualification" | "countries" | "gender"
>;

/**
 * Distinct dropdown values derived from the candidate mirror, each sorted
 * most-common first. The `races` and `grades` options are fixed sets, not
 * derived here — the caller adds them (see {@link queryFilterOptions}).
 */
export function buildFilterOptions(
  views: FilterSource[],
): Omit<FilterOptions, "races" | "grades"> {
  const byFrequency = (values: Iterable<string>) => {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([v]) => v);
  };

  return {
    subjects: byFrequency(views.map((v) => v.subject)),
    nationalities: byFrequency(views.map((v) => v.nationality)),
    qualifications: byFrequency(views.map((v) => v.qualification)),
    countries: byFrequency(views.flatMap((v) => v.countries)),
    genders: byFrequency(views.map((v) => v.gender)),
  };
}
