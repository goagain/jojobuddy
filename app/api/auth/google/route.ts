import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { OAUTH_COOKIE, appOrigin, googleEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleEnabled()) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 400 });
  }
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/";
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${encodeURIComponent(next)}`;
  const redirectUri = `${appOrigin(request)}/api/auth/google/callback`;
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  google.searchParams.set("redirect_uri", redirectUri);
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", state);
  google.searchParams.set("prompt", "select_account");
  const response = NextResponse.redirect(google);
  response.cookies.set(OAUTH_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
