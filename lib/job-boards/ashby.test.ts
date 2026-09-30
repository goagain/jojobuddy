import { describe, expect, it } from "vitest";
import { ashbyJobAdapter } from "@/lib/job-adapters/ashby";
import {
  ashbyBoardAdapter,
  ashbyBoardSlug,
  companyFromAshbyHtml,
  findAshbyBoardUrl,
  parseAshbyJobs,
  readAshbyJobText,
} from "@/lib/job-boards/ashby";
import { classifyLevel } from "@/lib/job-boards/classify";
import { discoverJobBoard } from "@/lib/job-boards/index";
import { scoreJobMatch } from "@/lib/job-boards/match";
import { prepareListings } from "@/lib/job-boards/prepare";
import type { FetchText } from "@/lib/job-boards/types";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const payload = {
  jobs: [
    {
      id: "eng-new1",
      title: "Senior Software Engineer, Backend",
      department: "Applied AI",
      team: "Applied AI Engineering",
      employmentType: "FullTime",
      location: "San Francisco",
      secondaryLocations: [{ location: "Seattle" }],
      publishedAt: daysAgo(3),
      isListed: true,
      jobUrl: "https://jobs.ashbyhq.com/openai/eng-new1",
      descriptionPlain: "Build distributed systems with Kubernetes and Go for training infrastructure.",
    },
    {
      id: "eng-old1",
      title: "Staff Engineer, Infrastructure",
      department: "Forward Deployed Engineering",
      team: "Forward Deployed Engineering",
      employmentType: "FullTime",
      location: "Seattle",
      publishedAt: daysAgo(120),
      isListed: true,
      jobUrl: "https://jobs.ashbyhq.com/openai/eng-old1",
      descriptionPlain: "Own reliability for large training clusters across regions and datacenters.",
    },
    {
      id: "sales-01",
      title: "Account Executive, Enterprise",
      department: "Go To Market",
      team: "Sales",
      employmentType: "FullTime",
      location: "New York City",
      publishedAt: daysAgo(2),
      isListed: true,
      jobUrl: "https://jobs.ashbyhq.com/openai/sales-01",
      descriptionPlain: "Sell the API platform to enterprise customers and expand existing accounts.",
    },
    {
      id: "intern01",
      title: "Software Engineer Intern",
      department: "Core Product & Platform",
      team: "Software",
      employmentType: "Intern",
      location: "San Francisco",
      publishedAt: daysAgo(1),
      isListed: true,
      jobUrl: "https://jobs.ashbyhq.com/openai/intern01",
      descriptionPlain: "Internship building product features with internal tools and code review.",
    },
    {
      id: "hidden01",
      title: "Hidden Research Scientist",
      department: "Research",
      team: "Research",
      isListed: false,
      location: "San Francisco",
      publishedAt: daysAgo(1),
      jobUrl: "https://jobs.ashbyhq.com/openai/hidden01",
      descriptionPlain: "This unlisted role should never appear in the board results.",
    },
  ],
};

const fetchText: FetchText = async (url) => {
  if (url.hostname === "api.ashbyhq.com") {
    return { status: 200, body: JSON.stringify(payload) };
  }
  return { status: 200, body: "<html><title>Jobs at OpenAI</title></html>" };
};

describe("ashby board", () => {
  it("reads a board slug and ignores a single job URL", () => {
    expect(ashbyBoardSlug(new URL("https://jobs.ashbyhq.com/openai/"))).toBe("openai");
    expect(ashbyBoardSlug(new URL("https://jobs.ashbyhq.com/openai/eng-new1"))).toBeNull();
  });

  it("reads the company name from the page title", () => {
    expect(companyFromAshbyHtml("<title>Jobs at OpenAI</title>")).toBe("OpenAI");
    expect(findAshbyBoardUrl(`<iframe src="https://jobs.ashbyhq.com/openai?embed=js"></iframe>`)).toBe(
      "https://jobs.ashbyhq.com/openai",
    );
  });

  it("discovers site facets and drops unlisted jobs", async () => {
    const found = await ashbyBoardAdapter.discover(new URL("https://jobs.ashbyhq.com/openai"), fetchText);
    expect(found?.meta.company).toBe("OpenAI");
    expect(found?.meta.total).toBe(4);
    expect(found?.meta.capabilities.supportsPostedSince).toBe(true);
    const teams = found?.meta.facets.find((facet) => facet.id === "team");
    expect(teams?.options.map((option) => option.label)).toContain("Applied AI Engineering");
    expect(teams?.options.map((option) => option.label)).not.toContain("Research");
    const employment = found?.meta.facets.find((facet) => facet.id === "employmentType");
    expect(employment?.options.map((option) => option.label)).toContain("Full-time");
  });

  it("filters engineers, recency, team, and level before the cap", () => {
    const listings = parseAshbyJobs(payload);
    const engineers = prepareListings(listings, { selections: {}, maxJobs: 10, role: "engineer" });
    expect(engineers.map((item) => item.id)).toEqual(["intern01", "eng-new1", "eng-old1"]);

    const recent = prepareListings(listings, {
      selections: {},
      maxJobs: 10,
      role: "engineer",
      postedWithinDays: 30,
    });
    expect(recent.map((item) => item.id)).toEqual(["intern01", "eng-new1"]);

    const team = prepareListings(listings, {
      selections: { team: ["Applied AI Engineering"] },
      maxJobs: 10,
    });
    expect(team.map((item) => item.id)).toEqual(["eng-new1"]);

    const interns = prepareListings(listings, { selections: {}, maxJobs: 10, levels: ["intern"] });
    expect(interns.map((item) => item.id)).toEqual(["intern01"]);
    expect(classifyLevel("Technical Program Manager")).toBe("manager");
    expect(classifyLevel("Senior Software Engineer")).toBe("senior");
    expect(classifyLevel("Account Executive, Enterprise")).toBe("unspecified");
  });

  it("follows an embedded Ashby board", async () => {
    const embeddedFetch: FetchText = async (url) => {
      if (url.hostname === "example.com") {
        return {
          status: 200,
          body: `<iframe src="https://jobs.ashbyhq.com/openai?embed=js"></iframe>`,
        };
      }
      return fetchText(url);
    };
    const found = await discoverJobBoard(new URL("https://example.com/careers"), embeddedFetch);
    expect(found?.adapterId).toBe("ashby");
    expect(found?.boardUrl).toBe("https://jobs.ashbyhq.com/openai");
    expect(found?.meta.company).toBe("OpenAI");
  });

  it("reads one posting for import", async () => {
    const page = await ashbyJobAdapter.fetch(
      new URL("https://jobs.ashbyhq.com/openai/eng-new1"),
      fetchText,
    );
    expect(page?.title).toBe("Senior Software Engineer, Backend");
    expect(page?.text).toContain("Kubernetes");
    expect(readAshbyJobText(payload, "missing")).toBeNull();
  });

  it("ranks a backend listing above sales for a backend profile", () => {
    const profile = {
      headline: "Backend engineer",
      skills: ["Kubernetes", "Go"],
      titles: ["Backend Engineer"],
      tech: ["Kubernetes"],
    };
    const engineer = scoreJobMatch(profile, {
      title: "Senior Software Engineer, Backend",
      family: "Applied AI Engineering",
      excerpt: "Kubernetes and Go",
    });
    const sales = scoreJobMatch(profile, {
      title: "Account Executive, Enterprise",
      family: "Sales",
      excerpt: "Sell to enterprise customers",
    });
    expect(engineer).toBeGreaterThan(sales);
    expect(engineer).toBeGreaterThan(0);
    expect(scoreJobMatch({ skills: [], titles: [], tech: [] }, { title: "Engineer" })).toBe(0);
  });
});
