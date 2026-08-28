import { NextResponse } from "next/server";
import { listCraftSummariesForProfile, listLatestCraftsByJob } from "@/lib/craft-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
    const crafts = profileId
      ? await listCraftSummariesForProfile(auth.user.id, profileId)
      : await listLatestCraftsByJob(auth.user.id);
    return NextResponse.json({ crafts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
