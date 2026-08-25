import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const schema = z.object({
  url: z.string().url("Enter a valid URL"),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = schema.parse(await request.json());
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "parse_url",
      payload: { url: body.url },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({
      jobId: job.id,
      workerOnline,
      hint: workerOnline
        ? "Queued"
        : "Queued, but no worker is online. Run npm run dev:worker in another terminal.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
