import { NextResponse } from "next/server";
import { getCurrentUser, googleEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    googleEnabled: googleEnabled(),
  });
}
