import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { getWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const job = await getWork(id, auth.user.id);
    if (!job) return NextResponse.json({ error: "Work job not found" }, { status: 404 });
    return NextResponse.json({
      job,
      workerOnline: await isWorkerOnline(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
