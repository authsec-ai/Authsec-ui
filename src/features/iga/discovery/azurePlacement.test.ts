import { describe, expect, it } from "vitest";

import { labelGroups } from "@/features/discovery/cloud/azure/azurePlacement";

import { planSwitch } from "./model";

const exact = (value: number) => ({ kind: "exact" as const, value });

describe("Azure subscription and resource group", () => {
  const params = new URLSearchParams({ provider: "azure", type: "resources", subscription: "sub-a", resource_group: "sub-a/iga-test", kind: "microsoft.keyvault/vaults" });

  it("stay on every Azure tab", () => {
    for (const type of ["workloads", "identities", "agents", "sightings"] as const) {
      const { params: next, removed } = planSwitch(params, { provider: "azure", type: "resources", view: "published" }, { provider: "azure", type, view: "published" });
      expect(next.get("subscription")).toBe("sub-a");
      expect(next.get("resource_group")).toBe("sub-a/iga-test");
      expect(removed.map((r) => r.key)).not.toContain("subscription");
      expect(removed.map((r) => r.key)).not.toContain("resource_group");
    }
  });

  it("are named as removed when the provider changes", () => {
    const { params: next, removed } = planSwitch(params, { provider: "azure", type: "resources", view: "published" }, { provider: "aws", type: "resources", view: "published" });
    expect(next.get("subscription")).toBeNull();
    expect(next.get("resource_group")).toBeNull();
    expect(removed.filter((r) => r.key === "subscription" || r.key === "resource_group").map((r) => r.label)).toEqual(["Subscription", "Resource group"]);
  });

  it("name the subscription only where two resource groups share a name", () => {
    const groups = [
      { value: "sub-a/iga-test", label: "iga-test", count: exact(3) },
      { value: "sub-b/IGA-TEST", label: "IGA-TEST", count: exact(1) },
      { value: "sub-a/other", label: "other", count: exact(2) },
    ];
    const subscriptions = [{ value: "sub-a", label: "Authsec", count: exact(5) }];
    expect(labelGroups(groups, subscriptions).map((o) => o.label)).toEqual(["iga-test (Authsec)", "IGA-TEST (sub-b)", "other"]);
  });
});
