import { NextResponse } from "next/server";
import { z } from "zod";
import { getInterviewDigest, markInterviewCrawling, markInterviewFailed } from "@/lib/interview-store";
import { sanitizeCookie } from "@/lib/interview/onepoint";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const crawlSchema = z.object({
  cookie: z.string().optional(),
  clearCookie: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const digest = await getInterviewDigest(id, auth.user.id);
    if (!digest) return NextResponse.json({ error: "Interview digest not found" }, { status: 404 });
    const body = crawlSchema.parse(await request.json().catch(() => ({})));
    const cookie = body.clearCookie ? "" : body.cookie ? sanitizeCookie(body.cookie) : undefined;
    await markInterviewCrawling(id, auth.user.id, cookie);
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "crawl_interview",
      payload: { digestId: id },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ job, workerOnline });
  } catch (error) {
    const { id } = await context.params;
    const message = error instanceof Error ? error.message : "Failed to collect interview posts";
    await markInterviewFailed(id, auth.user.id, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
