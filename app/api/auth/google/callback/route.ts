import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_COOKIE, appOrigin, googleEnabled, loginWithGoogle } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  if (!googleEnabled()) return fail("Google sign-in is not configured");

  const error = url.searchParams.get("error");
  if (error) return fail("Google sign-in was cancelled");

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const [nonce, nextRaw = ""] = state.split(":", 2);
  const expected = (await cookies()).get(OAUTH_COOKIE)?.value;
  if (!expected || expected !== nonce) return fail("Sign-in session expired — please try again");
  if (!code) return fail("Google did not return an authorization code");

  const redirectUri = `${origin}/api/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return fail("Google token exchange failed");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  if (!profile.sub || !profile.email) return fail("Could not read Google account profile");

  const next = decodeURIComponent(nextRaw || "/") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const dest = NextResponse.redirect(`${origin}${safeNext}`);
  dest.cookies.delete(OAUTH_COOKIE);
  await loginWithGoogle(
    {
      googleId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      image: profile.picture,
    },
    dest,
  );
  return dest;
}
