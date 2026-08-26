import type { LlmRuntime } from "./llm-types";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmRequest = {
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  runtime: LlmRuntime;
};

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function openaiBase(url: string) {
  const base = trimSlash(url);
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

async function chatOllama(request: LlmRequest): Promise<string> {
  const { runtime } = request;
  const response = await fetch(`${trimSlash(runtime.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtime.modelId,
      stream: false,
      format: request.json ? "json" : undefined,
      options: {
        temperature: request.temperature ?? (request.json ? 0.2 : 0.4),
      },
      messages: request.messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/** Official OpenAI (and some gateways) reject `max_tokens` on newer chat/reasoning models. */
export function usesMaxCompletionTokens(kind: LlmRuntime["kind"], modelId: string): boolean {
  if (kind === "openai") return true;
  const id = modelId.toLowerCase();
  return /(?:^|[/_.-])(o[1-9]|gpt-5|gpt-4\.1)/.test(id);
}

async function chatOpenAICompatible(request: LlmRequest): Promise<string> {
  const { runtime } = request;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (runtime.apiKey) {
    headers.Authorization = `Bearer ${runtime.apiKey}`;
  }

  const limitKey = usesMaxCompletionTokens(runtime.kind, runtime.modelId)
    ? "max_completion_tokens"
    : "max_tokens";

  const response = await fetch(`${openaiBase(runtime.baseUrl)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: runtime.modelId,
      temperature: request.temperature ?? (request.json ? 0.2 : 0.4),
      [limitKey]: 10000,
      response_format: request.json ? { type: "json_object" } : undefined,
      messages: request.messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${runtime.providerName} failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatAnthropic(request: LlmRequest): Promise<string> {
  const { runtime } = request;
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  const base = trimSlash(runtime.baseUrl);
  const url = base.includes("/v1") ? `${base.replace(/\/v1$/, "")}/v1/messages` : `${base}/v1/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": runtime.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: runtime.modelId,
      max_tokens: 10000,
      temperature: request.temperature ?? (request.json ? 0.2 : 0.4),
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  return data.content?.find((part) => part.type === "text")?.text ?? "";
}

function mockCraftedResume(refined: boolean) {
  return {
    language: "zh",
    identity: {
      name: "示例候选人",
      headline: refined ? "高级全栈工程师 / 平台方向" : "全栈工程师",
      location: "上海",
      email: "you@example.com",
      phone: "",
      links: [{ label: "GitHub", url: "https://github.com/you" }],
    },
    summary: refined
      ? "5 年平台研发经验，擅长把实时分析查询打进 1 秒内，并用可审计的多租户权限和灰度配置，让增长团队安全、快速地上线实验。"
      : "有数据平台和运营后台经验，做过查询优化、权限和内部工具，也能和多个团队一起把需求落地。熟悉 TypeScript、Python、PostgreSQL 和 Redis。",
    skills: refined
      ? [
          { category: "语言", items: ["TypeScript", "Python", "SQL"] },
          {
            category: "平台",
            items: ["FastAPI", "Next.js", "PostgreSQL", "Redis", "Kafka", "Kubernetes"],
          },
          { category: "工程", items: ["OpenTelemetry", "Grafana", "CI/CD", "灰度发布"] },
        ]
      : [
          {
            category: "核心",
            items: [
              "TypeScript",
              "Python",
              "Next.js",
              "FastAPI",
              "PostgreSQL",
              "Redis",
              "Kafka",
              "Docker",
              "AWS",
            ],
          },
        ],
    experiences: [
      {
        title: "高级软件工程师",
        company: "北极星科技",
        location: "上海",
        startDate: "2023-03",
        endDate: "present",
        bullets: refined
          ? [
              "增长实时漏斗在高峰超时后，重构冷热数据与物化视图，并用 Redis 缓存实验配置；查询 P95 从 4.2s 降到 780ms，超时率从 9% 降到 0.4%。",
              "两次串租后重新设计 RBAC 与行级隔离，在 Kubernetes 服务网格内加入租户作用域中间件和权限审计；12 个月零串租，配置工单时长下降 40%。",
              "为实验配置补上 diff、审批、灰度开关与一键回滚，并用 Kafka 广播配置；错误发布从每周 3 次降到每月不足 1 次，上线周期从 2 天压到 4 小时。",
            ]
          : [
              "负责相关工作，优化了实时漏斗查询，把延迟明显降低，提升了分析师体验。",
              "设计多租户权限模型，减少错误授权，并补了审计日志。",
              "搭建实验配置协作流，减少发布冲突，让上线更快。",
            ],
      },
      {
        title: "软件工程师",
        company: "流光互娱",
        location: "杭州",
        startDate: "2020-07",
        endDate: "2023-02",
        bullets: refined
          ? [
              "把活动配置从手工 SQL 改成带校验和灰度的可视化发布，上线时长从 6 小时降到 40 分钟，版本日事故下降 70%。",
              "用异步任务重建三方支付对账，日对账从 4 小时降到 12 分钟，漏单发现从 T+1 变成 15 分钟内。",
            ]
          : [
              "做了活动配置后台，减少运营对 SQL 的依赖。",
              "重建支付对账任务，缩短漏单排查时间。",
            ],
      },
    ],
    projects: refined
      ? [
          {
            name: "内部可观测性套件",
            role: "",
            startDate: "",
            endDate: "",
            bullets: ["统一接入 OpenTelemetry 与服务红图，P1 故障定位从 48 分钟降到 22 分钟。"],
          },
        ]
      : [],
    education: [
      {
        school: "示例大学",
        degree: "本科",
        field: "计算机科学",
        startDate: "2016",
        endDate: "2020",
        highlights: [],
      },
    ],
    extras: [],
  };
}

function chatMock(request: LlmRequest): string {
  const blob = request.messages.map((message) => message.content).join("\n");
  const refined =
    blob.includes("Heaven's Door rewrite instructions") ||
    blob.includes("Kubernetes") ||
    blob.includes("canary") ||
    blob.includes("灰度");

  if (blob.includes("You are Heaven's Door") || blob.includes("Open the book and score it")) {
    return JSON.stringify({
      scores: {
        keywordHit: refined ? 94 : 78,
        quantifiedImpact: refined ? 92 : 86,
        experienceMatch: refined ? 90 : 80,
        signalToNoise: refined ? 91 : 74,
      },
      overall: refined ? 92 : 80,
      verdict: refined ? "s_rank" : "rewrite",
      rank: refined ? "S" : "B",
      deductions: refined
        ? []
        : [
            {
              dimension: "keywordHit",
              points: 8,
              reason:
                "JD asks for Kubernetes and canary releases; they only appear in skills, not experience.",
            },
            {
              dimension: "signalToNoise",
              points: 6,
              reason: "Summary is long; first experience bullets can be tighter.",
            },
          ],
      rewriteInstructions: refined
        ? []
        : [
            "Move the multi-tenant RBAC bullet up and weave Kubernetes into the Action.",
            "Call out canary/rollback in the experiment-config experience; drop vague 'responsible for related work'.",
            "Compress the summary to two sentences aimed at realtime analytics and config shipping.",
          ],
      atsKeywords: {
        hit: ["realtime analytics", "multi-tenant", "PostgreSQL", "Redis", "cross-team"],
        missed: refined ? [] : ["Kubernetes", "canary"],
      },
      summary: refined
        ? "The book is clean. Keywords, quantification, and seniority signals hold. ATS and an 8-second HR skim both pass."
        : "Structure is right, but ATS is not fully fed. Add Kubernetes / canary and thin the sentences.",
    });
  }

  return JSON.stringify(mockCraftedResume(refined));
}

export async function chat(request: LlmRequest): Promise<string> {
  switch (request.runtime.kind) {
    case "mock":
      return chatMock(request);
    case "ollama":
      return chatOllama(request);
    case "anthropic":
      return chatAnthropic(request);
    case "openai":
    case "openai_compatible":
      return chatOpenAICompatible(request);
    default:
      throw new Error(`Unsupported provider: ${request.runtime.kind}`);
  }
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return parseable JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
