import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteJobBoard, getJobBoard, setBoardDailyUpdate, setBoardProfile, setBoardStatus } from "@/lib/board-store";
import { getProfile } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  profileId: z.string().nullable().optional(),
  dailyUpdate: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const board = await getJobBoard(id, auth.user.id);
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    return NextResponse.json({ board });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const deleted = await deleteJobBoard(id, auth.user.id);
    if (!deleted) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    let board = await getJobBoard(id, auth.user.id);
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    if (body.profileId !== undefined) {
      if (body.profileId) {
        const profile = await getProfile(body.profileId, auth.user.id);
        if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      board = await setBoardProfile(auth.user.id, id, body.profileId || undefined);
    }
    if (body.dailyUpdate !== undefined) {
      board = await setBoardDailyUpdate(auth.user.id, id, body.dailyUpdate);
    }
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    return NextResponse.json({ board });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(_request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const existing = await getJobBoard(id, auth.user.id);
    if (!existing) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    await setBoardStatus(auth.user.id, id, "discovering");
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "discover_board",
      payload: { boardId: id },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ job, workerOnline });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
