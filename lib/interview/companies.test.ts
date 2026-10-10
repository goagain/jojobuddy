import { describe, expect, it } from "vitest";
import { parseCompanyTypeahead, pickCompany } from "./companies";

const amazon = [
  {
    result: {
      data: {
        json: {
          results: [
            { identifier: "amazon", name: "Amazon", logo: "https://oss.1p3a.com/logo/amazon.png!d" },
          ],
        },
      },
    },
  },
];

describe("company symbols", () => {
  it("reads the typeahead batch", () => {
    expect(parseCompanyTypeahead(amazon)).toEqual([
      { identifier: "amazon", name: "Amazon", logo: "https://oss.1p3a.com/logo/amazon.png!d" },
    ]);
  });

  it("prefers an exact symbol, then an exact name", () => {
    const hits = [
      { identifier: "uber-freight", name: "Uber Freight" },
      { identifier: "uber", name: "Uber" },
    ];
    expect(pickCompany("uber", hits)?.identifier).toBe("uber");
    expect(pickCompany("Uber Freight", hits)?.identifier).toBe("uber-freight");
    expect(pickCompany("amaz", [{ identifier: "amazon", name: "Amazon" }])?.identifier).toBe("amazon");
  });
});
