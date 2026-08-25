import { NextResponse } from "next/server";
import { z } from "zod";
import { masterResumeSchema } from "@/lib/schema";
import { createProfile, listProfiles } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Give this profile a name"),
  resume: masterResumeSchema,
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

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ profiles: await listProfiles(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load profiles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = createSchema.parse(await request.json());
    const profile = await createProfile(auth.user.id, body);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
