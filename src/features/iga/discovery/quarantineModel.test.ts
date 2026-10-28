import { describe, expect, it } from "vitest";

import type { DiscoveredAgent } from "@/app/api/discoveryApi";

import { quarantineErrorText, quarantineView } from "./quarantineModel";

const k8s = (o: Partial<DiscoveredAgent>) =>
  ({ status: "unregistered", source: "k8s_webhook", discovery_source_id: "src-1", quarantine_enforcement_error: "", ...o }) as DiscoveredAgent;

describe("quarantineView", () => {
  it("offers a cluster-enforced quarantine for a Kubernetes sighting", () => {
    const v = quarantineView(k8s({}));
    expect([v.quarantined, v.enforceable]).toEqual([false, true]);
    expect(v.line).toMatch(/cuts this workload's network/);
  });
  it("says a decision without a cluster blocks nothing", () => {
    expect(quarantineView(k8s({ source: "repo_scan", discovery_source_id: undefined })).line).toMatch(/records the decision/);
    expect(quarantineView(k8s({ status: "quarantined", source: "repo_scan", discovery_source_id: undefined })).line).toMatch(/on record only/);
  });
  it("tells blocked, pending and failed apart", () => {
    expect(quarantineView(k8s({ status: "quarantined", quarantine_enforced_at: "2026-10-28T10:00:00Z" }))).toMatchObject({ tone: "danger", line: "Blocked in the cluster: its network is cut." });
    expect(quarantineView(k8s({ status: "quarantined" })).line).toMatch(/waiting for the cluster's agent/);
    expect(quarantineView(k8s({ status: "quarantined", quarantine_enforcement_error: "not enforced in-cluster: no actuation agent" })).line).toBe(
      "Quarantined, but NOT blocked: no actuation agent.",
    );
  });
});

describe("quarantineErrorText", () => {
  it("names the permission on a refusal", () => {
    expect(quarantineErrorText(403, false)).toMatch(/discovery:quarantine/);
    expect(quarantineErrorText(403, true)).toMatch(/release/);
    expect(quarantineErrorText(500, false)).toMatch(/could not be recorded/);
  });
});
