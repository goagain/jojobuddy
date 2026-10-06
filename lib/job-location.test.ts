import { describe, expect, it } from "vitest";
import {
  formatJobLocations,
  jobLocationKeys,
  jobMatchesCityFilter,
  parseJobCities,
  parseLocationCity,
  relocateHeaderLocation,
  UNNAMED_LOCATION,
} from "@/lib/job-location";

describe("parseLocationCity", () => {
  it("takes the first segment before a comma", () => {
    expect(parseLocationCity("Austin, Texas, United States")).toBe("Austin");
    expect(parseLocationCity("Seattle, Washington, United States")).toBe("Seattle");
  });

  it("returns the whole string when there is no comma", () => {
    expect(parseLocationCity("San Jose")).toBe("San Jose");
    expect(parseLocationCity("Seattle")).toBe("Seattle");
  });
});

describe("parseJobCities", () => {
  it("merges multi-location strings into unique cities", () => {
    expect(
      parseJobCities(
        "Austin, Texas, United States / Denver, Colorado, United States / Seattle, Washington, United States",
      ),
    ).toEqual(["Austin", "Denver", "Seattle"]);
    expect(
      parseJobCities("Austin, Texas, United States / San Diego, California, United States"),
    ).toEqual(["Austin", "San Diego"]);
  });

  it("treats short and long forms of the same city as one name", () => {
    expect(parseJobCities("Seattle")).toEqual(["Seattle"]);
    expect(parseJobCities("Seattle, Washington, United States")).toEqual(["Seattle"]);
  });
});

describe("formatJobLocations", () => {
  it("joins normalized cities with slash", () => {
    expect(formatJobLocations(["Austin", "Denver", "Seattle"])).toBe("Austin / Denver / Seattle");
  });
});

describe("jobLocationKeys", () => {
  it("falls back to unnamed when location is empty", () => {
    expect(jobLocationKeys({})).toEqual([UNNAMED_LOCATION]);
  });
});

describe("relocateHeaderLocation", () => {
  it("writes Open to relocate when the posting has one different city", () => {
    expect(relocateHeaderLocation("上海", "Seattle, Washington, United States")).toBe(
      "Open to relocate to Seattle",
    );
    expect(relocateHeaderLocation("San Francisco", "Seattle")).toBe("Open to relocate to Seattle");
  });

  it("keeps the current city when it matches the only posting city", () => {
    expect(relocateHeaderLocation("Seattle, Washington", "Seattle")).toBeNull();
    expect(relocateHeaderLocation("seattle", "Seattle, Washington, United States")).toBeNull();
  });

  it("leaves multi-city, remote, and empty postings unchanged", () => {
    expect(relocateHeaderLocation("上海", "Austin / Denver")).toBeNull();
    expect(relocateHeaderLocation("上海", "Remote")).toBeNull();
    expect(relocateHeaderLocation("上海", "")).toBeNull();
    expect(relocateHeaderLocation("", "Seattle")).toBe("Open to relocate to Seattle");
  });
});

describe("jobMatchesCityFilter", () => {
  it("matches when any job city is selected", () => {
    const job = {
      location:
        "Austin, Texas, United States / Denver, Colorado, United States / Seattle, Washington, United States",
    };
    expect(jobMatchesCityFilter(job, new Set(["Seattle"]))).toBe(true);
    expect(jobMatchesCityFilter(job, new Set(["San Jose"]))).toBe(false);
    expect(jobMatchesCityFilter(job, new Set())).toBe(true);
  });
});
