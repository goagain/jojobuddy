import { NextResponse } from "next/server";
import { fetchCatalog } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const models = await fetchCatalog(auth.user.id, id);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
