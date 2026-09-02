/** Superhuman careers page that embeds an Ashby job board iframe. */
export const SUPERHUMAN_ASHBY_EMBED_URL =
  "https://superhuman.com/company/careers/jobs?ashby_jid=bcb48e52-7aaa-4ad5-8241-f0b8027b87e4";

export const superhumanAshbyEmbedFixture = {
  parentFrame: {
    title: "",
    documentTitle: "Explore open roles at Superhuman",
    company: "Superhuman",
    bodyText: [
      "Products",
      "Solutions",
      "AI",
      "Resources",
      "Pricing",
      "Contact sales",
      "Sign in",
      "Open Roles at Superhuman",
      "Builders of Superhuman Platform apps",
      "Company",
      "Careers",
      "Legal",
      "Privacy Policy",
    ].join("\n"),
  },
  ashbyFrame: {
    title: "Software Engineer, Back-End - Mail (Canada)",
    documentTitle: "Software Engineer, Back-End - Mail (Canada)",
    company: "",
    bodyText: [
      "All Jobs",
      "Software Engineer, Back-End - Mail (Canada)",
      "Location",
      "Remote - Canada",
      "Employment Type",
      "Full time",
      "Department",
      "Engineering",
      "Compensation",
      "CA$168K – CA$291K • Offers Equity",
      "Superhuman offers a remote-flexible working model for this particular role on the Mail team.",
      "Responsibilities",
      "Design and build reliable backend systems for millions of users.",
      "Qualifications",
      "5+ years of experience building distributed systems in production.",
      "Experience with Go, Python, or similar backend languages.",
    ].join("\n"),
  },
} as const;
