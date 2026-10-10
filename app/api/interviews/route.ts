import { NextResponse } from "next/server";
import { z } from "zod";
import { createInterviewDigest, listInterviewDigests, markInterviewFailed } from "@/lib/interview-store";
import { resolveCompany } from "@/lib/interview/companies";
import { DEFAULT_INTERVIEW_FID, DEFAULT_INTERVIEW_FORUM, parseForumTarget, sanitizeCookie } from "@/lib/interview/onepoint";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  company: z.string().trim().min(1).max(80),
  companySlug: z.string().trim().min(1).max(80).optional(),
  forumUrl: z.string().trim().optional(),
  limit: z.number().int().min(1).max(80).optional(),
  cookie: z.string().optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ digests: await listInterviewDigests(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load interview digests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let digestId = "";
  try {
    const body = createSchema.parse(await request.json());
    const forum = body.forumUrl
      ? parseForumTarget(body.forumUrl)
      : { fid: DEFAULT_INTERVIEW_FID, url: DEFAULT_INTERVIEW_FORUM };
    const resolved = body.companySlug
      ? { identifier: body.companySlug, name: body.company }
      : await resolveCompany(fetch, body.company);
    const cookie = body.cookie ? sanitizeCookie(body.cookie) : "";
    const digest = await createInterviewDigest(auth.user.id, {
      company: resolved.name,
      companySlug: resolved.identifier,
      forumUrl: forum.url,
      fid: forum.fid,
      limit: body.limit ?? 40,
      cookie,
    });
    digestId = digest.id;
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "crawl_interview",
      payload: { digestId: digest.id },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ digest, job, workerOnline });
  } catch (error) {
    if (digestId) {
      const message = error instanceof Error ? error.message : "Failed to collect interview posts";
      await markInterviewFailed(digestId, auth.user.id, message).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Failed to create interview digest";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
