import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGlobal } from "@/lib/auth";
import { deleteModel, LlmAccessError, updateModelScope } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  scope: z.enum(["global", "personal"]),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const model = await updateModelScope(auth.user.id, id, body.scope, canManageGlobal(auth.user));
    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }
    return NextResponse.json({ model });
  } catch (error) {
    if (error instanceof LlmAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const ok = await deleteModel(auth.user.id, id, canManageGlobal(auth.user));
    if (!ok) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LlmAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
