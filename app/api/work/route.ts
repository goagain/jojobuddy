import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";
import { WORK_JOB_TYPES } from "@/lib/work-types";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(WORK_JOB_TYPES),
  payload: z.unknown(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = schema.parse(await request.json());
    const job = await enqueueWork({ userId: auth.user.id, ...body });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({
      job,
      workerOnline,
      hint: workerOnline
        ? "Queued"
        : "Queued, but no worker is online. Open another terminal and select the worker role.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
