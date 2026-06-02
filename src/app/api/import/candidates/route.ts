// Auth-guarded upload endpoint for the candidate CSV import. A Route Handler
// (not a Server Action) because the export is ~1.7 MB and Server Actions cap
// request bodies at 1 MB by default. Thin bridge only — all the work lives in
// src/lib/candidates.

import { authorize } from "@/lib/access";
import { importCandidatesFromCsv } from "@/lib/candidates/import";

export async function POST(request: Request) {
  const access = await authorize({ admin: true });
  if (!access.ok) return access.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Expected a CSV file in the `file` field." },
      { status: 400 },
    );
  }

  try {
    const report = await importCandidatesFromCsv(await file.text());
    return Response.json({ report });
  } catch (error) {
    console.error("Candidate CSV import failed:", error);
    const message =
      error instanceof Error ? error.message : "Import failed unexpectedly.";
    return Response.json({ error: message }, { status: 500 });
  }
}
