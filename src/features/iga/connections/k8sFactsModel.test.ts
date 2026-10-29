import { describe, expect, it } from "vitest";

import type { InventorySummary } from "@/app/api/igaInventoryApi";

import { agentCounters, inventoryCountText } from "./k8sFactsModel";

const summary = {
  data: { workloads: { value: 6, exact: true }, identities: { value: 500, exact: false }, resources: { value: null, exact: false } },
  meta: {},
} as InventorySummary;

describe("K8s cluster facts", () => {
  it("counts what Discovery holds for the cluster", () => {
    expect(inventoryCountText({ data: summary }, "workloads")).toBe("6");
    expect(inventoryCountText({ data: summary }, "identities")).toBe("At least 500");
    expect(inventoryCountText({ data: summary }, "resources")).toBe("Could not be counted");
    expect(inventoryCountText({ isLoading: true }, "workloads")).toBe("Counting…");
    expect(inventoryCountText({ isError: true }, "workloads")).toBe("Could not be counted");
  });

  it("shows an agent's counters only when it reports them", () => {
    expect(agentCounters({ namespacesVisible: null, workloadsScanned: null, workloadsMatched: null })).toEqual([]);
    expect(agentCounters({ namespacesVisible: 4, workloadsScanned: null, workloadsMatched: 0 })).toEqual([
      ["Namespaces visible", 4],
      ["Agents matched", 0],
    ]);
  });
});
