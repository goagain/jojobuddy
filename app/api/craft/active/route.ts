import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { isWorkerOnline, listActiveCraftJobs } from "@/lib/work-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const jobs = await listActiveCraftJobs(auth.user.id);
    return NextResponse.json({
      jobs,
      workerOnline: await isWorkerOnline(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load active crafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
