import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob, getProfile } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  profileId: z.string().min(1, "Please select a profile"),
  jobId: z.string().min(1, "Please select a job"),
  generatorModelId: z.string().min(1, "Please select a model for Star Platinum"),
  judgeModelId: z.string().min(1, "Please select a model for Heaven's Door"),
  options: z
    .object({
      autoRefine: z.boolean().optional(),
      threshold: z.number().min(60).max(99).optional(),
      maxRounds: z.number().min(1).max(5).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = requestSchema.parse(await request.json());
    const [profile, job] = await Promise.all([
      getProfile(body.profileId, auth.user.id),
      getJob(body.jobId, auth.user.id),
    ]);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const queued = await enqueueWork({
      userId: auth.user.id,
      type: "craft",
      payload: {
        profileId: body.profileId,
        jobId: body.jobId,
        generatorModelId: body.generatorModelId,
        judgeModelId: body.judgeModelId,
        options: body.options,
      },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({
      jobId: queued.id,
      workerOnline,
      hint: workerOnline
        ? "Queued"
        : "Queued, but no worker is online. Run npm run dev:worker in another terminal.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("Please select") ||
      message.includes("invalid") ||
      message.includes("not imported") ||
      message.includes("No models available")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
