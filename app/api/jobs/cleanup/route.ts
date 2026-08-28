import { NextResponse } from "next/server";
import { deleteJobsOlderThan, STALE_JOB_DAYS } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const deleted = await deleteJobsOlderThan(auth.user.id, STALE_JOB_DAYS);
    return NextResponse.json({ deleted, days: STALE_JOB_DAYS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
