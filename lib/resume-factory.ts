import type { MasterResume, Experience, StarBullet } from "./schema";

export function uid() {
  return crypto.randomUUID();
}

export function emptyBullet(): StarBullet {
  return { id: uid(), raw: "" };
}

export function emptyExperience(): Experience {
  return {
    id: uid(),
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "present",
    businessContext: "",
    techStack: [],
    bullets: [emptyBullet()],
  };
}

const PRESENT = /present|current|now|ongoing|至今|现在|今|在职|进行中/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function resumeDateValue(value?: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  if (PRESENT.test(raw)) return 999999;

  const ymd = raw.match(/(\d{4})\D{0,3}(\d{1,2})?/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = ymd[2] ? Number(ymd[2]) : 1;
    return year * 100 + month;
  }

  const monthYear = raw.match(/([a-zA-Z]+)\.?\s+(\d{4})/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()] ?? 0;
    if (month) return Number(monthYear[2]) * 100 + month;
  }

  const yearOnly = raw.match(/\b(19|20)\d{2}\b/);
  if (yearOnly) return Number(yearOnly[0]) * 100 + 1;

  return 0;
}

function byTimeDesc<T extends { startDate?: string; endDate?: string }>(a: T, b: T) {
  const end = resumeDateValue(b.endDate) - resumeDateValue(a.endDate);
  if (end !== 0) return end;
  return resumeDateValue(b.startDate) - resumeDateValue(a.startDate);
}

export function sortResumeByTime(resume: MasterResume): MasterResume {
  return {
    ...resume,
    experiences: [...resume.experiences].sort(byTimeDesc),
    projects: [...resume.projects].sort(byTimeDesc),
    education: [...resume.education].sort(byTimeDesc),
  };
}

export function emptyResume(): MasterResume {
  return {
    identity: {
      name: "",
      email: "",
      phone: "",
      location: "",
      headline: "",
      summary: "",
      links: [],
    },
    skills: [{ category: "Core skills", items: [] }],
    experiences: [emptyExperience()],
    projects: [],
    education: [
      {
        school: "",
        degree: "",
        field: "",
        startDate: "",
        endDate: "",
        highlights: [],
      },
    ],
    certifications: [],
    languages: [],
    softSkills: [],
  };
}
