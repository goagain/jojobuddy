import { describe, expect, it } from "vitest";
import { parseForumAccount } from "./account";

describe("parseForumAccount", () => {
  it("reads the username, credits, and rice from user.me", () => {
    const account = parseForumAccount([
      {
        result: {
          data: {
            json: {
              uid: 7,
              username: "rick",
              credits: "480",
              user_count: { extcredits1: 126 },
            },
          },
        },
      },
    ]);
    expect(account).toEqual({ username: "rick", credits: 480, rice: 126 });
  });

  it("returns null when nobody is logged in", () => {
    expect(parseForumAccount([{ result: { data: { json: null } } }])).toBeNull();
  });
});
