import { NextResponse } from "next/server";
import { z } from "zod";
import { masterResumeSchema } from "@/lib/schema";
import { deleteProfile, getProfile, updateProfile } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  resume: masterResumeSchema.optional(),
  sources: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["upload", "paste", "url", "manual"]),
        filename: z.string().optional(),
        mimeType: z.string().optional(),
        url: z.string().optional(),
        text: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const profile = await getProfile(id, auth.user.id);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ profile });
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
    const profile = await updateProfile(auth.user.id, id, body);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ profile });
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
    const ok = await deleteProfile(auth.user.id, id);
    if (!ok) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
