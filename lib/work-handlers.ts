import { saveCraftedResume } from "./craft-store";
import { getJob, getProfile } from "./entity-store";
import { fetchJobPage } from "./extract-url";
import { pickParseRuntime, resolveRuntime } from "./llm-store";
import { analyzeJobDescription } from "./parse-job";
import {
  resolveJobFields,
} from "./job-fields";
import { structureResume } from "./parse-resume";
import { uid } from "./resume-factory";
import { crawlSavedBoard, discoverSavedBoard, scoreSavedBoard } from "./job-boards/run";
import type { AnalyzeJobPayload, CraftPayload, CrawlBoardPayload, DiscoverBoardPayload, ParseResumePayload, ParseUrlPayload, RefreshJobsPayload, ScoreBoardPayload } from "./work-types";
import { workPriority } from "./work-types";
import type { WorkJobDoc } from "./work-store";
import { hasHigherPriorityQueued, releaseForHigherPriority, updateWorkProgress } from "./work-store";
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
    const fields = resolveJobFields(insights, {
      title: page.title,
      company: page.company,
      location: page.location,
      postedAt: page.postedAt,
      sourceUrl: page.url,
    });
    return {
      title: fields.title,
      company: fields.company,
      location: fields.location,
      jobNumber: fields.jobNumber,
      postedAt: fields.postedAt,
      sourceKind: "url",
      sourceUrl: page.url,
      sourceText: page.text,
      parsedText: page.text,
      requirements: fields.requirements,
      keywords: fields.keywords,
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
    const payload = job.payload as RefreshJobsPayload;
    await updateWorkProgress(id, { step: "Loading URL jobs", percent: 5 });
    const runtime = await pickParseRuntime(job.userId);
    const result = await refreshUserJobs(job.userId, runtime, async (step, percent) => {
      await updateWorkProgress(id, { step, percent });
    }, {
      jobIds: payload.jobIds,
      nextIndex: payload.nextIndex,
      shouldYield: () => hasHigherPriorityQueued(workPriority(job.type)),
      onYield: (state) =>
        releaseForHigherPriority(id, state, {
          step: "Paused — job import and resume craft go first",
          percent: 0,
        }),
    });
    return result;
  }

  if (job.type === "discover_board") {
    const payload = job.payload as DiscoverBoardPayload;
    return discoverSavedBoard(payload.boardId, job.userId, async (step, percent) => {
      await updateWorkProgress(id, { step, percent });
    });
  }

  if (job.type === "crawl_board") {
    const payload = job.payload as CrawlBoardPayload;
    return crawlSavedBoard(
      payload.boardId,
      job.userId,
      payload.query,
      payload.profileId,
      async (step, percent) => {
        await updateWorkProgress(id, { step, percent });
      },
      boardPriorityControl(job, id),
    );
  }

  if (job.type === "score_board") {
    const payload = job.payload as ScoreBoardPayload;
    return scoreSavedBoard(
      payload.boardId,
      job.userId,
      payload.profileId,
      async (step, percent) => {
        await updateWorkProgress(id, { step, percent });
      },
      boardPriorityControl(job, id),
    );
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
      jobLocation: jobDesc.location,
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

function boardPriorityControl(job: WorkJobDoc, id: string) {
  const payload = job.payload as { resumeScoring?: boolean };
  return {
    resumeScoring: payload.resumeScoring,
    shouldYield: () => hasHigherPriorityQueued(workPriority(job.type)),
    pause: (step: string, percent: number) =>
      releaseForHigherPriority(id, { ...(job.payload as Record<string, unknown>), resumeScoring: true }, { step, percent }),
  };
}
