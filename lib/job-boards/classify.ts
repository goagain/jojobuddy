import type { BoardListing, JobLevel, RoleFamily, StoredBoardListing } from "./types";

const LEVEL_RULES: [JobLevel, RegExp][] = [
  ["intern", /\bintern(ship)?\b/i],
  ["new_grad", /\b(new grad|new graduate|university grad|early career|entry[- ]level|junior)\b/i],
  ["director", /\b(director|vice president|vp|head of)\b/i],
  ["principal", /\b(principal|distinguished)\b/i],
  ["staff", /\bstaff\b/i],
  ["manager", /\b(managers?|mgr\.?)\b/i],
  ["senior", /\b(senior|\bsr\.?)\b/i],
];

export function classifyLevel(title: string, extra = ""): JobLevel {
  const text = `${title} ${extra}`.trim();
  for (const [level, pattern] of LEVEL_RULES) {
    if (pattern.test(text)) return level;
  }
  if (/\b(engineer|engineering|developer|sre|devops)\b/i.test(text)) return "mid";
  return "unspecified";
}

export function isEngineerRole(parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ");
  return /\b(engineers?|engineering|developers?|\bsre\b|devops)\b/i.test(text);
}

export function toStoredListing(listing: BoardListing): StoredBoardListing {
  const roleFamily: RoleFamily = isEngineerRole([
    listing.title,
    listing.family,
    listing.facets.department,
    listing.facets.team,
  ])
    ? "engineer"
    : "other";
  return {
    ...listing,
    level: classifyLevel(listing.title),
    roleFamily,
  };
}
