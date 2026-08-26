import { NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { requireRoot } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoot();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
