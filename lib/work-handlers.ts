import { saveCraftedResume } from "./craft-store";
import { getJob, getProfile } from "./entity-store";
import { fetchJobPage } from "./extract-url";
import { pickParseRuntime, resolveRuntime } from "./llm-store";
import { structureResume } from "./parse-resume";
import { uid } from "./resume-factory";
import type { CraftPayload, ParseResumePayload, ParseUrlPayload } from "./work-types";
import type { WorkJobDoc } from "./work-store";
import { updateWorkProgress } from "./work-store";
import { craftResume } from "./workflow";

export async function runWorkJob(job: WorkJobDoc): Promise<unknown> {
  const id = job._id?.toHexString();
  if (!id) throw new Error("Work job is missing id");
  if (!job.userId) throw new Error("Work job is missing userId");

  if (job.type === "parse_url") {
    const payload = job.payload as ParseUrlPayload;
    await updateWorkProgress(id, { step: "JS engine fetching page", percent: 20 });
    const page = await fetchJobPage(payload.url);
    await updateWorkProgress(id, { step: "Cleaning job text", percent: 80 });
    return {
      title: page.title,
      company: page.company,
      location: page.location,
      sourceKind: "url",
      sourceUrl: page.url,
      sourceText: page.text,
      parsedText: page.text,
    };
  }

  if (job.type === "parse_resume") {
    const payload = job.payload as ParseResumePayload;
    await updateWorkProgress(id, { step: "Model structuring resume", percent: 30 });
    const runtime = await pickParseRuntime(job.userId, payload.modelId || undefined);
    const resume = await structureResume(payload.text, runtime);
    return {
      resume,
      source: {
        id: uid(),
        kind: payload.kind,
        filename: payload.filename,
        mimeType: payload.mimeType,
        text: payload.text,
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (job.type === "craft") {
    const payload = job.payload as CraftPayload;
    await updateWorkProgress(id, { step: "Loading profile and job", percent: 8 });
    const userId = job.userId;
    const [profile, jobDesc, generator, judge] = await Promise.all([
      getProfile(payload.profileId, userId),
      getJob(payload.jobId, userId),
      resolveRuntime(userId, payload.generatorModelId),
      resolveRuntime(userId, payload.judgeModelId),
    ]);
    if (!profile) throw new Error("Profile not found");
    if (!jobDesc) throw new Error("Job not found");
    const result = await craftResume({
      masterResume: profile.resume,
      jobDescription: jobDesc.parsedText,
      generator,
      judge,
      options: payload.options,
      onProgress: (progress) => updateWorkProgress(id, progress),
    });
    await saveCraftedResume({
      userId: job.userId,
      profileId: profile.id,
      jobId: jobDesc.id,
      profileName: profile.name,
      personName: profile.resume.identity.name,
      jobTitle: jobDesc.title,
      jobCompany: jobDesc.company,
      result,
    });
    return {
      ...result,
      profile: { id: profile.id, name: profile.name },
      job: { id: jobDesc.id, title: jobDesc.title, company: jobDesc.company },
    };
  }

  throw new Error(`Unknown work type: ${job.type}`);
}
