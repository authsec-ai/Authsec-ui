import { describe, expect, it } from "vitest";

import { isWildcardPattern, nodeSize, titleLines, type NodeDescription } from "./nodeView";

describe("isWildcardPattern", () => {
  it("matches a pattern that names every resource", () => {
    expect(isWildcardPattern("*")).toBe(true);
    expect(isWildcardPattern(" * ")).toBe(true);
    expect(isWildcardPattern("arn:aws:s3:::*")).toBe(true);
    expect(isWildcardPattern("arn:aws:dynamodb:us-east-1:429418377036:*")).toBe(true);
  });

  it("does not match a pattern narrowed by something fixed", () => {
    expect(isWildcardPattern("arn:aws:s3:::acme-attachments/*")).toBe(false);
    expect(isWildcardPattern("arn:aws:dynamodb:us-east-1:429418377036:table/*")).toBe(false);
    expect(isWildcardPattern("s3:Get*")).toBe(false);
  });
});

describe("card title", () => {
  const base: NodeDescription = {
    icon: "resource",
    category: "resource",
    title: "short",
    type: "Resource",
    context: null,
    indicators: [],
    notes: [],
    frontier: [],
    frontierHidden: 0,
  };

  it("takes two lines when the name is long, so it is never cut to one", () => {
    expect(titleLines("acme-refunds")).toBe(1);
    expect(titleLines("secret:acme/legacy-summarizer-api-key")).toBe(2);
  });

  it("reserves the second line's height in the layout", () => {
    const one = nodeSize(base);
    const two = nodeSize({ ...base, title: "acme-iga-attachments-429418377036-archive" });
    expect(two.height - one.height).toBe(20);
    expect(one.width).toBeGreaterThanOrEqual(220);
  });
});
