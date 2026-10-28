import { describe, expect, it } from "vitest";

import type { Connection } from "@/app/api/connectionsApi";

import { setupTarget } from "./connectionModel";

const conn = (id: string, provider: string) => ({ id, provider }) as unknown as Connection;

describe("setupTarget", () => {
  it("sends Slack's notifications link to a connection's Notifications tab", () => {
    expect(setupTarget([conn("gh", "github"), conn("a1", "aws")], "notifications")).toBe("/iga/connections/a1/notifications");
  });

  it("finds Notifications on an Azure-only workspace", () => {
    expect(setupTarget([conn("z1", "azure")], "notifications")).toBe("/iga/connections/z1/notifications");
  });

  it("defaults to an AWS account's enforcement, even after a cluster with its own", () => {
    expect(setupTarget([conn("z1", "azure"), conn("a1", "aws")], undefined)).toBe("/iga/connections/a1/enforcement");
    expect(setupTarget([conn("k1", "k8s"), conn("a1", "aws")], undefined)).toBe("/iga/connections/a1/enforcement");
    expect(setupTarget([conn("a1", "aws")], "nonsense")).toBe("/iga/connections/a1/enforcement");
  });

  it("falls back to the connections list", () => {
    expect(setupTarget([conn("z1", "azure")], "settings")).toBe("/iga/connections");
    expect(setupTarget(undefined, "notifications")).toBe("/iga/connections");
  });
});
