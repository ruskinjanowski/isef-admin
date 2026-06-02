// Pure anchor-case check for the tiering engine (no DB). Run with:
//   node --import tsx scripts/tier-check.ts
// One case (nonwhite/9/4yr) is an accepted divergence: the additive model has
// no hard experience gate, so a strong profile outscores the 6-year rule.

import { computeTier, type TierInputs } from "@/lib/tiering/tiering";

const base: TierInputs = {
  race: "white",
  appearance: 9,
  years: 3,
  qualification: "Bachelor Degree",
  certification: "Bachelors in Education (B.Ed)",
  age: 34,
  nationality: "Egypt",
  manualAdjustment: null,
};

const cases: { name: string; want: number | null; inputs: TierInputs }[] = [
  { name: "white/9/3yr/degree/34", want: 1, inputs: base },
  { name: "white/5/2yr/degree/40", want: 2, inputs: { ...base, appearance: 5, years: 2, age: 40 } },
  { name: "white/2/2yr/diploma/30", want: 3, inputs: { ...base, appearance: 2, years: 2, qualification: "National Diploma", certification: "TEFL", age: 30 } },
  { name: "nonwhite-indian/9/7yr/Masters/40", want: 1, inputs: { ...base, race: "indian", appearance: 9, years: 7, qualification: "Masters", age: 40 } },
  { name: "nonwhite/9/4yr/degree/40", want: 2, inputs: { ...base, race: "black", appearance: 9, years: 4, age: 40 } },
  { name: "nonwhite/2/2yr/degree/40", want: 3, inputs: { ...base, race: "coloured", appearance: 2, years: 2, age: 40 } },
  { name: "unscreened (no race)", want: null, inputs: { ...base, race: null } },
  { name: "manual adj -25 drops T1→T2", want: 2, inputs: { ...base, manualAdjustment: -25 } },
];

let pass = 0;
for (const c of cases) {
  const r = computeTier(c.inputs);
  const ok = r.tier === c.want;
  if (ok) pass++;
  console.log(
    `${ok ? "✓" : "✗"} ${c.name.padEnd(34)} → tier ${String(r.tier).padEnd(7)} score ${r.score ?? "—"}${ok ? "" : `   EXPECTED ${c.want}`}`,
  );
}
console.log(`\n${pass}/${cases.length} anchor cases pass`);
console.log(
  "(nonwhite/9/4yr is an accepted additive-model divergence — see header.)",
);
