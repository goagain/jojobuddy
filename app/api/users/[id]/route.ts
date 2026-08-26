import { NextResponse } from "next/server";
import { z } from "zod";
import { setUserAdmin } from "@/lib/auth";
import { requireRoot } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  isAdmin: z.boolean(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireRoot();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    if (id === auth.user.id) {
      return NextResponse.json({ error: "Cannot change your own admin flag" }, { status: 400 });
    }
    const body = patchSchema.parse(await request.json());
    const user = await setUserAdmin(id, body.isAdmin);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    const status = message === "User not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
