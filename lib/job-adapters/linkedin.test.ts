import { describe, expect, it } from "vitest";
import { linkedInJobId, parseLinkedInGuestHtml } from "@/lib/job-adapters/linkedin";

describe("linkedInJobId", () => {
  it("reads currentJobId from search-results URLs", () => {
    expect(
      linkedInJobId(
        "https://www.linkedin.com/jobs/search-results/?currentJobId=4450815040&keywords=engineer",
      ),
    ).toBe("4450815040");
  });

  it("reads id from jobs/view URLs", () => {
    expect(linkedInJobId("https://www.linkedin.com/jobs/view/4450815040")).toBe("4450815040");
    expect(linkedInJobId("https://www.linkedin.com/jobs/view/senior-backend-engineer-4450815040")).toBe(
      "4450815040",
    );
    expect(linkedInJobId("https://www.linkedin.com/jobs/view/4433709661/?alternateChannel=search")).toBe(
      "4433709661",
    );
  });
});

describe("parseLinkedInGuestHtml", () => {
  it("extracts title, company, location, and description", () => {
    const html = `
      <section class="top-card-layout">
        <h2 class="top-card-layout__title">Senior Backend Engineer</h2>
        <div class="top-card-layout__entity-info">
          <span class="topcard__flavor">IBM</span>
          <span class="topcard__flavor">Vancouver, British Columbia, Canada</span>
        </div>
        <span class="topcard__flavor topcard__flavor--bullet">Vancouver, British Columbia, Canada</span>
        <span class="topcard__flavor topcard__flavor--bullet">158 applicants</span>
        <time datetime="2024-03-01">1 month ago</time>
      </section>
      <div class="show-more-less-html__markup">
        <p>Introduction</p>
        <p>At IBM Software, we transform client challenges into solutions for distributed systems.</p>
      </div>
    `;
    const parsed = parseLinkedInGuestHtml(html);
    expect(parsed?.title).toBe("Senior Backend Engineer");
    expect(parsed?.company).toBe("IBM");
    expect(parsed?.location).toBe("Vancouver, British Columbia, Canada");
    expect(parsed?.postedAt).toBe("2024-03-01T00:00:00.000Z");
    expect(parsed?.text).toContain("Description");
    expect(parsed?.text).toContain("IBM Software");
  });
});
