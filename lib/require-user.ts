import { NextResponse } from "next/server";
import { getCurrentUser, type PublicUser } from "@/lib/auth";

export async function requireUser(): Promise<
  { ok: true; user: PublicUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Please sign in" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}
