import { NextResponse } from "next/server";
import { canManageGlobal, getCurrentUser, type PublicUser } from "@/lib/auth";

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

export async function requireAdmin(): Promise<
  { ok: true; user: PublicUser } | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!canManageGlobal(auth.user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }
  return auth;
}

export async function requireRoot(): Promise<
  { ok: true; user: PublicUser } | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!auth.user.isRoot) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Root only" }, { status: 403 }),
    };
  }
  return auth;
}
