// Auth-guarded read/write for a candidate's screening. Thin bridge only — the
// validation and upsert live in src/lib/screening.

import { eq } from "drizzle-orm";

import { authorize } from "@/lib/access";
import { db } from "@/db";
import { candidates } from "@/db/schema";
import {
  getScreening,
  parseScreeningInput,
  saveScreening,
} from "@/lib/screening/screening";

type Params = { params: Promise<{ candidateId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const access = await authorize();
  if (!access.ok) return access.response;

  const { candidateId } = await params;
  const screening = await getScreening(candidateId);
  return Response.json({ screening });
}

export async function PUT(request: Request, { params }: Params) {
  const access = await authorize();
  if (!access.ok) return access.response;

  const { candidateId } = await params;

  // Guard the FK so a bad id returns 404, not an opaque constraint error.
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!candidate) {
    return Response.json({ error: "Candidate not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = parseScreeningInput(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const screening = await saveScreening(
      candidateId,
      parsed.value,
      access.user.id,
    );
    return Response.json({ screening });
  } catch (error) {
    console.error("Saving screening failed:", error);
    return Response.json({ error: "Could not save screening." }, { status: 500 });
  }
}
