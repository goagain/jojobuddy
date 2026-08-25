import { NextResponse } from "next/server";
import { z } from "zod";
import { addModels, listModels } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  providerId: z.string().min(1),
  models: z
    .array(
      z.object({
        modelId: z.string().min(1),
        label: z.string().optional(),
      }),
    )
    .min(1, "Import at least one model"),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ models: await listModels(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = importSchema.parse(await request.json());
    const created = await addModels(
      auth.user.id,
      body.providerId,
      body.models.map((item) => ({
        modelId: item.modelId,
        label: item.label || item.modelId,
      })),
    );
    return NextResponse.json({ models: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
