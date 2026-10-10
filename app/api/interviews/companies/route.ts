import { NextResponse } from "next/server";
import { parseCompanyTypeahead } from "@/lib/interview/companies";
import { companyTypeaheadRequest, onePointFetch } from "@/lib/interview/onepoint";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json({ companies: [] });
  try {
    const payload = await onePointFetch(fetch, companyTypeaheadRequest(query.slice(0, 40)), undefined, "");
    return NextResponse.json({ companies: parseCompanyTypeahead(payload).slice(0, 8) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search companies";
    return NextResponse.json({ error: message, companies: [] }, { status: 502 });
  }
}
