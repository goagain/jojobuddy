import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCompany } from "@/lib/interview/companies";
import { DEFAULT_INTERVIEW_FID, DEFAULT_INTERVIEW_FORUM, sanitizeCookie } from "@/lib/interview/onepoint";
import {
  createInterviewDigest,
  findInterviewDigest,
  markInterviewFailed,
} from "@/lib/interview-store";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const openSchema = z.object({
  company: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(80).optional(),
  cookie: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let digestId = "";
  try {
    const body = openSchema.parse(await request.json());
    const resolved = await resolveCompany(fetch, body.company);
    const existing = await findInterviewDigest(auth.user.id, {
      companySlug: resolved.identifier,
      company: resolved.name,
      query: body.company,
      fid: DEFAULT_INTERVIEW_FID,
    });
    if (existing) {
      return NextResponse.json({ digest: existing, created: false, workerOnline: await isWorkerOnline() });
    }
    const cookie = body.cookie ? sanitizeCookie(body.cookie) : "";
    const digest = await createInterviewDigest(auth.user.id, {
      company: resolved.name,
      companySlug: resolved.identifier,
      forumUrl: DEFAULT_INTERVIEW_FORUM,
      fid: DEFAULT_INTERVIEW_FID,
      limit: body.limit ?? 40,
      cookie,
    });
    digestId = digest.id;
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "crawl_interview",
      payload: { digestId: digest.id },
    });
    return NextResponse.json({ digest, job, created: true, workerOnline: await isWorkerOnline() });
  } catch (error) {
    if (digestId) {
      const message = error instanceof Error ? error.message : "Failed to collect interview posts";
      await markInterviewFailed(digestId, auth.user.id, message).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Failed to open interview digest";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
