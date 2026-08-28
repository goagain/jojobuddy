import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteJob, getJob, updateJob } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  sourceKind: z.enum(["paste", "url"]).optional(),
  sourceUrl: z.string().optional(),
  sourceText: z.string().optional(),
  parsedText: z.string().min(20).optional(),
  requirements: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const job = await getJob(id, auth.user.id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const job = await updateJob(auth.user.id, id, body);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const ok = await deleteJob(auth.user.id, id);
    if (!ok) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
