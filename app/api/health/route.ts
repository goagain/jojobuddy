import { NextResponse } from "next/server";
import { pingMongo } from "@/lib/db";
import { entityCounts } from "@/lib/entity-store";
import { listModels, listProviders } from "@/lib/llm-store";
import { requireUser } from "@/lib/require-user";
import { isWorkerOnline, queueCounts } from "@/lib/work-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const mongo = await pingMongo();
  if (!mongo.ok) {
    return NextResponse.json({
      ok: false,
      mongo: false,
      workerOnline: false,
      user: auth.user,
      hint: `MongoDB offline: ${mongo.error}`,
      hintCode: "mongo_down",
      hintVars: { error: mongo.error ?? "unknown" },
      providers: [],
      models: [],
      counts: { profiles: 0, jobs: 0, models: 0, queued: 0, running: 0 },
    });
  }

  try {
    const [providers, models, counts, workerOnline, queue] = await Promise.all([
      listProviders(auth.user.id),
      listModels(auth.user.id),
      entityCounts(auth.user.id),
      isWorkerOnline(),
      queueCounts(auth.user.id),
    ]);
    const workerHint = workerOnline
      ? `worker online · queue ${queue.queued}/${queue.running}`
      : "worker offline — long jobs stall. Run npm run dev:worker in another terminal";
    return NextResponse.json({
      ok: true,
      mongo: true,
      workerOnline,
      user: auth.user,
      hint: `Profiles ${counts.profiles} · Jobs ${counts.jobs} · Models ${models.length} · ${workerHint}`,
      hintCode: "ok",
      hintVars: {
        profiles: counts.profiles,
        jobs: counts.jobs,
        models: models.length,
        queued: queue.queued,
        running: queue.running,
        workerOnline: workerOnline ? 1 : 0,
      },
      providers,
      models,
      counts: { ...counts, models: models.length, ...queue },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({
      ok: false,
      mongo: true,
      workerOnline: false,
      user: auth.user,
      hint: message,
      hintCode: "error",
      providers: [],
      models: [],
      counts: { profiles: 0, jobs: 0, models: 0, queued: 0, running: 0 },
    });
  }
}
