import { describe, expect, it } from "vitest";

import { k8sWorkloadName } from "./k8s";

describe("k8sWorkloadName (UI-051)", () => {
  it("leads with the workload's own name and keeps the container", () => {
    expect(k8sWorkloadName("agent (Deployment/billing-agent) in ns/agent-demo")).toEqual({ name: "billing-agent", container: "agent" });
    expect(k8sWorkloadName("worker (CronJob/invoice-sync)")).toEqual({ name: "invoice-sync", container: "worker" });
  });
  it("leaves any other name alone", () => {
    expect(k8sWorkloadName("checkout")).toBeNull();
    expect(k8sWorkloadName("shop/checkout")).toBeNull();
  });
});
