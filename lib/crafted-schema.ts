import { z } from "zod";

const linkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const skillGroupSchema = z.object({
  category: z.string(),
  items: z.array(z.string()).default([]),
});

const craftedExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional().default(""),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(z.string()).default([]),
});

const craftedProjectSchema = z.object({
  name: z.string(),
  role: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  bullets: z.array(z.string()).default([]),
});

const craftedEducationSchema = z.object({
  school: z.string(),
  degree: z.string().default(""),
  field: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
});

const craftedExtraSchema = z.object({
  label: z.string(),
  items: z.array(z.string()).default([]),
});

/** Structured tailored resume returned by Star Platinum (generator). */
export const craftedResumeSchema = z.object({
  language: z.enum(["en", "zh"]).default("en"),
  identity: z.object({
    name: z.string(),
    headline: z.string().optional().default(""),
    location: z.string().optional().default(""),
    email: z.string().optional().default(""),
    phone: z.string().optional().default(""),
    links: z.array(linkSchema).default([]),
  }),
  summary: z.string().default(""),
  skills: z.array(skillGroupSchema).default([]),
  experiences: z.array(craftedExperienceSchema).default([]),
  projects: z.array(craftedProjectSchema).default([]),
  education: z.array(craftedEducationSchema).default([]),
  extras: z.array(craftedExtraSchema).default([]),
});

export type CraftedResumeDoc = z.infer<typeof craftedResumeSchema>;
export type CraftedExperience = z.infer<typeof craftedExperienceSchema>;
export type CraftedProject = z.infer<typeof craftedProjectSchema>;
export type CraftedEducation = z.infer<typeof craftedEducationSchema>;
