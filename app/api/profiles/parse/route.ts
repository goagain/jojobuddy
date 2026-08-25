import { NextResponse } from "next/server";
import { extractTextFromUpload } from "@/lib/extract-file";
import { requireUser } from "@/lib/require-user";
import { enqueueWork, isWorkerOnline } from "@/lib/work-store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const form = await request.formData();
    const modelId = String(form.get("modelId") ?? "");
    const pasted = String(form.get("text") ?? "").trim();
    const file = form.get("file");

    let text = pasted;
    let filename: string | undefined;
    let mimeType: string | undefined;
    let kind: "upload" | "paste" = "paste";

    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      mimeType = file.type;
      text = await extractTextFromUpload({ buffer, filename, mimeType });
      kind = "upload";
    }

    if (text.length < 20) {
      throw new Error("Resume text is too short — try another file or paste more content");
    }

    const job = await enqueueWork({
      userId: auth.user.id,
      type: "parse_resume",
      payload: { text, modelId, kind, filename, mimeType },
    });
    const workerOnline = await isWorkerOnline();
    return NextResponse.json({
      jobId: job.id,
      workerOnline,
      hint: workerOnline
        ? "Queued"
        : "Queued, but no worker is online. Run npm run dev:worker in another terminal.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
