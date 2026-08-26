import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGlobal } from "@/lib/auth";
import { PROVIDER_KINDS } from "@/lib/llm-types";
import { createProvider, LlmAccessError, listProviders } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Give this API a name"),
  kind: z.enum(PROVIDER_KINDS),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  scope: z.enum(["global", "personal"]).optional(),
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
    const asAdmin = canManageGlobal(auth.user);
    const scope = asAdmin ? body.scope : "personal";
    const provider = await createProvider(auth.user.id, { ...body, scope }, asAdmin);
    return NextResponse.json({ provider });
  } catch (error) {
    if (error instanceof LlmAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
