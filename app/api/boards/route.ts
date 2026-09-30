import { NextResponse } from "next/server";
import { z } from "zod";
import { createJobBoard, listJobBoards, setBoardStatus } from "@/lib/board-store";
import { assertPublicHttpUrl } from "@/lib/extract-url";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  url: z.string().min(1),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ boards: await listJobBoards(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load boards";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let boardId = "";
  try {
    const body = createSchema.parse(await request.json());
    const url = await assertPublicHttpUrl(body.url.trim());
    const board = await createJobBoard(auth.user.id, url.toString());
    boardId = board.id;
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "discover_board",
      payload: { boardId: board.id },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ board, job, workerOnline });
  } catch (error) {
    if (boardId) {
      const message = error instanceof Error ? error.message : "Failed to discover board";
      await setBoardStatus(auth.user.id, boardId, "failed", message).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Failed to create board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
