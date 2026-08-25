import { NextResponse } from "next/server";
import { z } from "zod";
import { PROVIDER_KINDS } from "@/lib/llm-types";
import { createProvider, listProviders } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Give this API a name"),
  kind: z.enum(PROVIDER_KINDS),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ providers: await listProviders(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = createSchema.parse(await request.json());
    const provider = await createProvider(auth.user.id, body);
    return NextResponse.json({ provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
