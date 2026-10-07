import { NextResponse } from "next/server";
import { getCraftedResume, saveCraftedResumeEdit } from "@/lib/craft-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get("profileId") ?? "";
    const jobId = url.searchParams.get("jobId") ?? "";
    if (!profileId || !jobId) {
      return NextResponse.json({ error: "Profile and job are required" }, { status: 400 });
    }
    const craft = await getCraftedResume(auth.user.id, profileId, jobId);
    return NextResponse.json({ craft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const MAX_EDITED_MARKDOWN = 100_000;

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as {
      profileId?: unknown;
      jobId?: unknown;
      editedMarkdown?: unknown;
    };
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!profileId || !jobId) {
      return NextResponse.json({ error: "Profile and job are required" }, { status: 400 });
    }
    if (body.editedMarkdown !== null && typeof body.editedMarkdown !== "string") {
      return NextResponse.json({ error: "editedMarkdown must be a string or null" }, { status: 400 });
    }
    if (typeof body.editedMarkdown === "string" && body.editedMarkdown.length > MAX_EDITED_MARKDOWN) {
      return NextResponse.json({ error: "Edited resume is too long" }, { status: 400 });
    }
    const craft = await saveCraftedResumeEdit({
      userId: auth.user.id,
      profileId,
      jobId,
      editedMarkdown: body.editedMarkdown,
    });
    if (!craft) {
      return NextResponse.json({ error: "Crafted resume not found" }, { status: 404 });
    }
    return NextResponse.json({ craft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
