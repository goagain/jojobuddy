import { NextResponse } from "next/server";
import { z } from "zod";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listNotifications(auth.user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const readSchema = z.object({
  ids: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = readSchema.parse(await request.json().catch(() => ({})));
    await markNotificationsRead(auth.user.id, body.ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notifications";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
