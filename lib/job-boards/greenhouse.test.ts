import { describe, expect, it } from "vitest";
import { greenhouseJobAdapter } from "@/lib/job-adapters/greenhouse";
import {
  findGreenhouseBoardUrl,
  greenhouseBoardAdapter,
  greenhouseBoardSlug,
  greenhouseJobRef,
  parseGreenhouseJobs,
} from "@/lib/job-boards/greenhouse";
import { discoverJobBoard } from "@/lib/job-boards/index";
import { prepareListings } from "@/lib/job-boards/prepare";
import type { FetchText } from "@/lib/job-boards/types";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const payload = {
  jobs: [
    {
      id: 8089959,
      title: "Senior Software Engineer, Ads",
      absolute_url: "https://job-boards.greenhouse.io/reddit/jobs/8089959",
      company_name: "Reddit",
      location: { name: "New York City, NY" },
      departments: [{ name: "Ads Engineering" }],
      offices: [{ name: "New York", location: "New York, NY, United States" }],
      first_published: daysAgo(4),
      content: "&lt;p&gt;Build distributed systems with Kubernetes and Go for the ads platform.&lt;/p&gt;",
    },
    {
      id: 7000002,
      title: "Staff Engineer, Infrastructure",
      absolute_url: "https://job-boards.greenhouse.io/reddit/jobs/7000002",
      company_name: "Reddit",
      location: { name: "Remote - United States" },
      departments: [{ name: "BE Platform" }],
      offices: [
        { name: "Remote - United States" },
        { name: "San Francisco", location: "San Francisco, CA" },
      ],
      first_published: daysAgo(80),
      content: "&lt;p&gt;Own reliability for large services across regions.&lt;/p&gt;",
    },
    {
      id: 7000003,
      title: "Account Executive, Enterprise",
      absolute_url: "https://job-boards.greenhouse.io/reddit/jobs/7000003",
      company_name: "Reddit",
      location: { name: "Chicago, IL" },
      departments: [{ name: "Large Customer Sales" }],
      offices: [{ name: "Chicago" }],
      first_published: daysAgo(2),
      content: "&lt;p&gt;Sell the ads platform to enterprise customers.&lt;/p&gt;",
    },
  ],
};

const fetchText: FetchText = async (url) => {
  if (url.hostname === "boards-api.greenhouse.io" && url.pathname.endsWith("/jobs")) {
    return { status: 200, body: JSON.stringify(payload) };
  }
  if (url.hostname === "boards-api.greenhouse.io" && url.pathname.endsWith("/8089959")) {
    return { status: 200, body: JSON.stringify(payload.jobs[0]) };
  }
  return { status: 404, body: "" };
};

describe("greenhouse board", () => {
  it("reads a board slug from both Greenhouse hosts and ignores a job URL", () => {
    expect(greenhouseBoardSlug(new URL("https://job-boards.greenhouse.io/reddit"))).toBe("reddit");
    expect(greenhouseBoardSlug(new URL("https://boards.greenhouse.io/reddit/"))).toBe("reddit");
    expect(greenhouseBoardSlug(new URL("https://boards.greenhouse.io/embed/job_board?for=reddit"))).toBe("reddit");
    expect(greenhouseBoardSlug(new URL("https://job-boards.greenhouse.io/reddit/jobs/8089959"))).toBeNull();
    expect(greenhouseJobRef(new URL("https://job-boards.greenhouse.io/reddit/jobs/8089959"))).toEqual({
      board: "reddit",
      id: "8089959",
    });
  });

  it("finds an embedded board", () => {
    expect(findGreenhouseBoardUrl(`<iframe src="https://job-boards.greenhouse.io/reddit"></iframe>`)).toBe(
      "https://job-boards.greenhouse.io/reddit",
    );
    expect(
      findGreenhouseBoardUrl(`<iframe src="https://boards.greenhouse.io/embed/job_board?for=reddit"></iframe>`),
    ).toBe("https://job-boards.greenhouse.io/reddit");
  });

  it("discovers department and office facets", async () => {
    const found = await greenhouseBoardAdapter.discover(
      new URL("https://job-boards.greenhouse.io/reddit"),
      fetchText,
    );
    expect(found?.boardUrl).toBe("https://job-boards.greenhouse.io/reddit");
    expect(found?.meta.company).toBe("Reddit");
    expect(found?.meta.total).toBe(3);
    expect(found?.meta.capabilities.supportsPostedSince).toBe(true);
    const departments = found?.meta.facets.find((facet) => facet.id === "department");
    expect(departments?.options.map((option) => option.label)).toContain("Ads Engineering");
    const offices = found?.meta.facets.find((facet) => facet.id === "office");
    expect(offices?.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["San Francisco", "Remote - United States"]),
    );
  });

  it("keeps a job when either of its offices is selected", () => {
    const listings = parseGreenhouseJobs(payload);
    expect(listings[0]?.excerpt).toContain("Kubernetes");
    expect(listings[0]?.excerpt).not.toContain("&lt;");

    const engineers = prepareListings(listings, { selections: {}, maxJobs: 10, role: "engineer" });
    expect(engineers.map((item) => item.id)).toEqual(["8089959", "7000002"]);

    const recent = prepareListings(listings, {
      selections: {},
      maxJobs: 10,
      role: "engineer",
      postedWithinDays: 30,
    });
    expect(recent.map((item) => item.id)).toEqual(["8089959"]);

    const office = prepareListings(listings, {
      selections: { office: ["San Francisco"] },
      maxJobs: 10,
    });
    expect(office.map((item) => item.id)).toEqual(["7000002"]);
  });

  it("follows an embedded Greenhouse board", async () => {
    const embeddedFetch: FetchText = async (url) => {
      if (url.hostname === "example.com") {
        return { status: 200, body: `<iframe src="https://job-boards.greenhouse.io/reddit"></iframe>` };
      }
      return fetchText(url);
    };
    const found = await discoverJobBoard(new URL("https://example.com/careers"), embeddedFetch);
    expect(found?.adapterId).toBe("greenhouse");
    expect(found?.meta.company).toBe("Reddit");
  });

  it("reads one posting for import", async () => {
    const page = await greenhouseJobAdapter.fetch(
      new URL("https://job-boards.greenhouse.io/reddit/jobs/8089959"),
      fetchText,
    );
    expect(page?.title).toBe("Senior Software Engineer, Ads");
    expect(page?.company).toBe("Reddit");
    expect(page?.text).toContain("Kubernetes");
    expect(page?.location).toContain("New York");
  });
});
