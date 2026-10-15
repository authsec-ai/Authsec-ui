import { describe, expect, it } from "vitest";

import { pathReachesFolder, policySentence, reachesFolder } from "./model";

describe("pathReachesFolder", () => {
  it("whole-bucket holders and whole-bucket rules reach everything", () => {
    expect(pathReachesFolder("", "sandbox/")).toBe(true);
    expect(pathReachesFolder("attachments/*", "")).toBe(true);
  });
  it("a role limited to another folder does not reach this one", () => {
    expect(pathReachesFolder("attachments/*", "sandbox/")).toBe(false);
  });
  it("matches a path inside, above, or a wildcard over the folder", () => {
    expect(pathReachesFolder("sandbox/a.txt", "sandbox/")).toBe(true);
    expect(pathReachesFolder("sandbox/*", "sandbox/")).toBe(true);
    expect(pathReachesFolder("a/*", "a/b/")).toBe(true);
    expect(pathReachesFolder("sand*", "sandbox/")).toBe(true);
  });
  it("a sibling that only shares a leading letter does not match", () => {
    expect(pathReachesFolder("sandwich/*", "sandbox/")).toBe(false);
  });
  it("reachesFolder is true when any path reaches", () => {
    expect(reachesFolder(["attachments/*", "sandbox/x"], "sandbox/")).toBe(true);
    expect(reachesFolder(["attachments/*"], "sandbox/")).toBe(false);
    expect(reachesFolder([], "")).toBe(false);
  });
});

describe("policySentence", () => {
  const base = { roles: [{ name: "RoleA" }], resource: { bucket: "b", prefix: "" }, starts_at: null, ends_at: null };
  it("block reads 'blocked from reading'", () => {
    expect(policySentence({ ...base, effect: "block", access: ["read"] })).toContain("is blocked from reading on b");
  });
  it("allow reads 'allowed to read', never 'allowed to reading'", () => {
    const s = policySentence({ ...base, roles: [{ name: "A" }, { name: "B" }], effect: "allow", access: ["read", "write"] });
    expect(s).toContain("are allowed to read and write on b");
    expect(s).not.toContain("to reading");
  });
});
