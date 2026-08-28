import { saveCraftedResume } from "./craft-store";
import { getJob, getProfile } from "./entity-store";
import { fetchJobPage } from "./extract-url";
import { pickParseRuntime, resolveRuntime } from "./llm-store";
import { analyzeJobDescription } from "./parse-job";
import {
  resolveJobCompany,
  resolveJobLocation,
  resolveJobNumber,
  resolveJobTitle,
} from "./job-fields";
import { structureResume } from "./parse-resume";
import { uid } from "./resume-factory";
import type { AnalyzeJobPayload, CraftPayload, ParseResumePayload, ParseUrlPayload, RefreshJobsPayload } from "./work-types";
import type { WorkJobDoc } from "./work-store";
import { updateWorkProgress } from "./work-store";
import { craftResume } from "./workflow";
import { refreshUserJobs } from "./refresh-jobs";

export async function runWorkJob(job: WorkJobDoc): Promise<unknown> {
  const id = job._id?.toHexString();
  if (!id) throw new Error("Work job is missing id");
  if (!job.userId) throw new Error("Work job is missing userId");

  if (job.type === "parse_url") {
    const payload = job.payload as ParseUrlPayload;
    await updateWorkProgress(id, { step: "Fetching job page", percent: 20 });
    const page = await fetchJobPage(payload.url);
    await updateWorkProgress(id, { step: "Analyzing requirements and keywords", percent: 55 });
    const runtime = await pickParseRuntime(job.userId);
    const insights = await analyzeJobDescription(page.text, runtime, { sourceUrl: page.url });
    await updateWorkProgress(id, { step: "Cleaning job text", percent: 90 });
    return {
      title: resolveJobTitle(insights, page.title),
      company: resolveJobCompany(insights, page.company),
      location: resolveJobLocation(insights, page.location),
      jobNumber: resolveJobNumber(insights, page.url),
      sourceKind: "url",
      sourceUrl: page.url,
      sourceText: page.text,
      parsedText: page.text,
      postedAt: page.postedAt,
      requirements: insights.requirements,
      keywords: insights.keywords,
    };
  }

  if (job.type === "analyze_job") {
    const payload = job.payload as AnalyzeJobPayload;
    await updateWorkProgress(id, { step: "Analyzing requirements and keywords", percent: 30 });
    const runtime = await pickParseRuntime(job.userId, payload.modelId || undefined);
    const insights = await analyzeJobDescription(payload.text, runtime, {
      sourceUrl: payload.sourceUrl,
    });
    return insights;
  }

  if (job.type === "refresh_jobs") {
    void (job.payload as RefreshJobsPayload);
    await updateWorkProgress(id, { step: "Loading URL jobs", percent: 5 });
    const runtime = await pickParseRuntime(job.userId);
    const result = await refreshUserJobs(job.userId, runtime, async (step, percent) => {
      await updateWorkProgress(id, { step, percent });
    });
    return result;
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
