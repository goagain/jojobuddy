import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteInterviewDigest, getInterviewDigest, setInterviewCookie } from "@/lib/interview-store";
import { sanitizeCookie } from "@/lib/interview/onepoint";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  cookie: z.string().optional(),
  clearCookie: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const digest = await getInterviewDigest(id, auth.user.id);
  if (!digest) return NextResponse.json({ error: "Interview digest not found" }, { status: 404 });
  return NextResponse.json({ digest });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const existing = await getInterviewDigest(id, auth.user.id);
    if (!existing) return NextResponse.json({ error: "Interview digest not found" }, { status: 404 });
    const body = patchSchema.parse(await request.json());
    const cookie = body.clearCookie ? "" : body.cookie ? sanitizeCookie(body.cookie) : undefined;
    if (cookie === undefined) return NextResponse.json({ digest: existing });
    await setInterviewCookie(id, auth.user.id, cookie);
    const digest = await getInterviewDigest(id, auth.user.id);
    return NextResponse.json({ digest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update interview digest";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const deleted = await deleteInterviewDigest(id, auth.user.id);
  if (!deleted) return NextResponse.json({ error: "Interview digest not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
