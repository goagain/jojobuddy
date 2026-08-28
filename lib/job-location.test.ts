import { describe, expect, it } from "vitest";
import {
  formatJobLocations,
  jobLocationKeys,
  jobMatchesCityFilter,
  parseJobCities,
  parseLocationCity,
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
