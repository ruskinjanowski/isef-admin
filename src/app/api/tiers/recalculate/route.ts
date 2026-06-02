// Auth-guarded trigger for the bulk tier recalculation. Thin bridge — the work
// lives in src/lib/tiering/recalculate.ts.

import { authorize } from "@/lib/access";
import { recalculateAllTiers } from "@/lib/tiering/recalculate";

export async function POST() {
  const access = await authorize({ admin: true });
  if (!access.ok) return access.response;

  try {
    const summary = await recalculateAllTiers();
    return Response.json({ summary });
  } catch (error) {
    console.error("Tier recalculation failed:", error);
    return Response.json(
      { error: "Could not recalculate tiers." },
      { status: 500 },
    );
  }
}
