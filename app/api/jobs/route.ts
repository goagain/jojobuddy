import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob, listJobs } from "@/lib/entity-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

const createSchema = z.object({
  title: z.string().min(1, "Give this job a name"),
  company: optionalString,
  location: optionalString,
  sourceKind: z.enum(["paste", "url"]),
  sourceUrl: optionalString,
  sourceText: z.string().min(1, "Source cannot be empty"),
  parsedText: z.string().min(20, "Job description text is too short"),
  requirements: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  postedAt: optionalString,
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ jobs: await listJobs(auth.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const body = createSchema.parse(await request.json());
    const job = await createJob(auth.user.id, body);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
