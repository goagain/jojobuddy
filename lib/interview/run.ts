import { pickParseRuntime } from "../llm-store";
import { crawlInterviewPosts } from "./crawl";
import { extractQuestions, narrativeSummary } from "./extract";
import {
  getInterviewDigestForCrawl,
  markInterviewCrawling,
  markInterviewFailed,
  saveInterviewResult,
} from "../interview-store";

export async function crawlSavedInterview(
  digestId: string,
  userId: string,
  onProgress?: (step: string, percent: number) => Promise<void>,
) {
  const digest = await getInterviewDigestForCrawl(digestId, userId);
  if (!digest) throw new Error("Interview digest not found");
  await markInterviewCrawling(digestId, userId);
  try {
    const runtime = await pickParseRuntime(userId);
    const result = await crawlInterviewPosts({
      company: digest.company,
      companySlug: digest.companySlug || digest.company,
      fid: digest.fid,
      limit: digest.limit,
      cookie: digest.cookie,
      onProgress,
      extract:
        runtime.kind === "mock"
          ? undefined
          : async (posts) => {
              try {
                return await extractQuestions(runtime, posts);
              } catch {
                return [];
              }
            },
    });
    let summary = result.summary;
    if (runtime.kind !== "mock" && result.questions.length > 0) {
      summary = await narrativeSummary(runtime, digest.company, result.questions).catch(() => result.summary);
    }
    await saveInterviewResult(digestId, userId, {
      totalOnSite: result.totalOnSite,
      collected: result.threads.length,
      readableCount: result.readableCount,
      lockedCount: result.lockedCount,
      account: result.account,
      summary,
      questions: result.questions,
      threads: result.threads,
    });
    return { id: digestId, questionCount: result.questions.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to collect interview posts";
    await markInterviewFailed(digestId, userId, message);
    throw error;
  }
}
