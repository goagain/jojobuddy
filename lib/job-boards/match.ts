import type { MasterResume } from "@/lib/schema";
import type { BoardListing } from "./types";

export type MatchProfile = {
  headline?: string;
  skills: string[];
  titles: string[];
  tech: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hayHas(hay: string, phrase: string) {
  if (phrase.includes(" ")) return hay.includes(phrase);
  const pattern = new RegExp(`(?:^|[^a-z0-9+#])${escapeRegExp(phrase)}(?:[^a-z0-9+#]|$)`, "i");
  return pattern.test(hay);
}

export function matchProfileFromResume(resume: MasterResume): MatchProfile {
  const skills = resume.skills.flatMap((group) => group.items);
  const titles = resume.experiences.map((item) => item.title);
  const tech = [
    ...resume.experiences.flatMap((item) => item.techStack),
    ...resume.projects.flatMap((item) => item.techStack),
    ...resume.experiences.flatMap((item) => item.bullets.flatMap((bullet) => bullet.keywords ?? [])),
  ];
  return {
    headline: resume.identity.headline,
    skills,
    titles,
    tech,
  };
}

function phrasesFrom(profile: MatchProfile) {
  const raw = [profile.headline ?? "", ...profile.skills, ...profile.titles, ...profile.tech];
  const phrases = new Set<string>();
  for (const item of raw) {
    const phrase = item.trim().toLowerCase();
    if (phrase.length >= 2) phrases.add(phrase);
    for (const word of phrase.split(/[^a-z0-9+#]+/)) {
      if (word.length >= 4) phrases.add(word);
    }
  }
  return [...phrases];
}

/** 0–100 overlap of profile skills, titles, and tools with a listing. No model call. */
export function scoreJobMatch(
  profile: MatchProfile,
  listing: Pick<BoardListing, "title" | "family" | "excerpt">,
): number {
  const phrases = phrasesFrom(profile);
  if (phrases.length === 0) return 0;
  const hay = `${listing.title}\n${listing.family ?? ""}\n${listing.excerpt ?? ""}`.toLowerCase();
  let points = 0;
  let possible = 0;
  for (const phrase of phrases) {
    const weight = phrase.includes(" ") || phrase.length >= 8 ? 2 : 1;
    possible += weight;
    if (hayHas(hay, phrase)) points += weight;
  }
  return Math.round((points / possible) * 100);
}
