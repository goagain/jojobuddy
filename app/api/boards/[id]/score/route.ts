import { NextResponse } from "next/server";
import { z } from "zod";
import { getJobBoard } from "@/lib/board-store";
import { getProfile } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const scoreSchema = z.object({
  profileId: z.string().min(1),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const board = await getJobBoard(id, auth.user.id);
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    if (board.listings.length === 0) {
      return NextResponse.json({ error: "Pull jobs before scoring" }, { status: 400 });
    }
    const body = scoreSchema.parse(await request.json());
    const profile = await getProfile(body.profileId, auth.user.id);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "score_board",
      payload: { boardId: id, profileId: body.profileId },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ job, workerOnline });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to score board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
