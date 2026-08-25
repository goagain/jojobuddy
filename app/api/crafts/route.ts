import { NextResponse } from "next/server";
import { getCraftedResume } from "@/lib/craft-store";
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
