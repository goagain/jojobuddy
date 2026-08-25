import { z } from "zod";

const impactMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  direction: z.enum(["increase", "decrease", "absolute"]).optional(),
});

function newId() {
  return crypto.randomUUID();
}

const starBulletSchema = z.object({
  id: z.string().default(newId),
  raw: z.string().default(""),
  situation: z.string().optional(),
  task: z.string().optional(),
  action: z.string().optional(),
  result: z.string().optional(),
  impactMetrics: z.array(impactMetricSchema).optional(),
  keywords: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const experienceSchema = z.object({
  id: z.string().default(newId),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().optional(),
  startDate: z.string().default(""),
  endDate: z.string().default("present"),
  businessContext: z.string().default(""),
  techStack: z.array(z.string()).default([]),
  bullets: z.array(starBulletSchema).default([]),
  senioritySignals: z.array(z.string()).optional(),
});

const projectSchema = z.object({
  id: z.string().default(newId),
  name: z.string().default(""),
  role: z.string().optional(),
  url: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  summary: z.string().default(""),
  techStack: z.array(z.string()).default([]),
  bullets: z.array(starBulletSchema).default([]),
});

export const masterResumeSchema = z.object({
  identity: z.object({
    name: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().optional(),
    location: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
        }),
      )
      .default([]),
  }),
  skills: z
    .array(
      z.object({
        category: z.string(),
        items: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  experiences: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z
    .array(
      z.object({
        school: z.string().default(""),
        degree: z.string().default(""),
        field: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .default([]),
  languages: z
    .array(
      z.object({
        name: z.string(),
        level: z.string(),
      }),
    )
    .default([]),
  softSkills: z.array(z.string()).default([]),
});

export type MasterResume = z.infer<typeof masterResumeSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type StarBullet = z.infer<typeof starBulletSchema>;
export type ImpactMetric = z.infer<typeof impactMetricSchema>;

export const judgmentSchema = z.object({
  scores: z.object({
    keywordHit: z.number().min(0).max(100),
    quantifiedImpact: z.number().min(0).max(100),
    experienceMatch: z.number().min(0).max(100),
    signalToNoise: z.number().min(0).max(100),
  }),
  overall: z.number().min(0).max(100),
  verdict: z.enum(["s_rank", "pass", "rewrite", "reject"]),
  rank: z.string(),
  deductions: z.array(
    z.object({
      dimension: z.enum([
        "keywordHit",
        "quantifiedImpact",
        "experienceMatch",
        "signalToNoise",
      ]),
      points: z.number(),
      reason: z.string(),
    }),
  ),
  rewriteInstructions: z.array(z.string()),
  atsKeywords: z.object({
    hit: z.array(z.string()),
    missed: z.array(z.string()),
  }),
  summary: z.string(),
});

export type Judgment = z.infer<typeof judgmentSchema>;

export const SCORE_WEIGHTS = {
  keywordHit: 0.3,
  quantifiedImpact: 0.3,
  experienceMatch: 0.2,
  signalToNoise: 0.2,
} as const;

export function weightedOverall(scores: Judgment["scores"]): number {
  return Math.round(
    scores.keywordHit * SCORE_WEIGHTS.keywordHit +
      scores.quantifiedImpact * SCORE_WEIGHTS.quantifiedImpact +
      scores.experienceMatch * SCORE_WEIGHTS.experienceMatch +
      scores.signalToNoise * SCORE_WEIGHTS.signalToNoise,
  );
}

export function rankFromScore(overall: number): Judgment["verdict"] {
  if (overall >= 90) return "s_rank";
  if (overall >= 85) return "pass";
  if (overall >= 60) return "rewrite";
  return "reject";
}
