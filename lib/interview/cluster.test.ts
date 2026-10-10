import { describe, expect, it } from "vitest";
import { aggregateQuestions } from "./aggregate";
import { clusterMentions } from "./cluster";
import type { QuestionMention } from "./aggregate";

function mention(tid: number, text: string, kind: QuestionMention["kind"] = "coding"): QuestionMention {
  return { tid, title: `t${tid}`, text, kind };
}

describe("cluster interview questions", () => {
  it("merges spreadsheet paraphrases, including short titles", () => {
    const questions = aggregateQuestions(
      clusterMentions([
        mention(1, "Spreadsheet formula engine: implement set_cell and get_cell with formulas"),
        mention(2, "Phone screen: Implement setCell and getCell for a spreadsheet"),
        mention(3, "Excel table design: get_cell/set_cell with formulas and circular references"),
        mention(4, "Phone screen: Spreadsheet problem"),
        mention(5, "Phone screen: Detect circular dependencies when setting formulas"),
        mention(6, "Design a file storage system (Google Drive style)", "system_design"),
      ]),
    );
    const sheet = questions.find((question) => question.text.includes("Spreadsheet"));
    const drive = questions.find((question) => question.text.includes("Google Drive"));
    expect(sheet).toMatchObject({ count: 5, kind: "coding" });
    expect(drive).toMatchObject({ count: 1, kind: "system_design" });
  });

  it("keeps filesystem duplicate-content search apart from the vault file tree", () => {
    const questions = aggregateQuestions(
      clusterMentions([
        mention(1, "find_dups: traverse filesystem and find duplicate files using content hashing"),
        mention(2, "Implement a memory-vault file system that handles duplicate names by appending '(x)'"),
        mention(3, "Implement the filesystem create/list problem (commonly solved with a trie)"),
      ]),
    );
    expect(questions.map((question) => question.count).sort()).toEqual([1, 2]);
    expect(questions.find((question) => question.text.includes("find_dups"))?.count).toBe(1);
  });

  it("merges behavioral writeups and RAG design writeups without folding coding into them", () => {
    const questions = aggregateQuestions(
      clusterMentions([
        mention(1, "Behavioral: project deep dives aligned to company values", "behavioral"),
        mention(2, "Onsite: Harvey Values behavioral questions", "behavioral"),
        mention(3, "Project deep dive and behavioral (BQ) questions", "behavioral"),
        mention(4, "Design a law-firm memo Q&A AI agent (RAG + LLM + web crawling)", "system_design"),
        mention(5, "System design: design a RAG pipeline including chunking", "system_design"),
        mention(6, "Coding: implement embedding and retrieval using cosine similarity"),
      ]),
    );
    expect(questions.find((question) => question.kind === "behavioral")?.count).toBe(3);
    expect(questions.find((question) => question.text.includes("RAG"))?.count).toBe(2);
    expect(questions.find((question) => question.text.includes("embedding"))?.count).toBe(1);
  });

  it("still counts one thread once when the same problem is extracted twice", () => {
    const questions = aggregateQuestions(
      clusterMentions([
        mention(1, "Mini spreadsheet: set_cell/get_cell"),
        mention(1, "Spreadsheet with formulas and cycle detection"),
      ]),
    );
    expect(questions).toHaveLength(1);
    expect(questions[0]?.count).toBe(1);
  });
});
