import { NextResponse } from "next/server";
import { z } from "zod";
import { getJobBoard } from "@/lib/board-store";
import { getProfile } from "@/lib/entity-store";
import { JOB_LEVELS } from "@/lib/job-boards/types";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const dynamic = "force-dynamic";

const crawlSchema = z.object({
  selections: z.record(z.string(), z.array(z.string())).optional(),
  maxJobs: z.number().int().min(1).max(200),
  postedWithinDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
  role: z.enum(["engineer", "other"]).optional(),
  levels: z.array(z.enum(JOB_LEVELS)).optional(),
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
    if (!board.adapterId || !board.boardUrl) {
      return NextResponse.json({ error: "Read the board filters before pulling jobs" }, { status: 400 });
    }
    const body = crawlSchema.parse(await request.json());
    const profile = await getProfile(body.profileId, auth.user.id);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const query = {
      selections: body.selections ?? {},
      maxJobs: body.maxJobs,
      postedWithinDays: body.postedWithinDays,
      role: body.role,
      levels: body.levels?.length ? body.levels : undefined,
    };
    const job = await enqueueWork({
      userId: auth.user.id,
      type: "crawl_board",
      payload: { boardId: id, query, profileId: body.profileId },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({ job, workerOnline });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to crawl board";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
