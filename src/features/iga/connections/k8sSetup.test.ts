import { describe, expect, it } from "vitest";

import type { DiscoverySource } from "@/app/api/discoveryApi";

import { IGA_AGENT_CHART, IGA_AGENT_CHART_VERSION, clusterNameProblem, connectedSource, enforceProblem, k8sSetupCommand } from "./k8sSetup";

const setup = {
  clusterName: "prod-eks-us-east",
  controlPlaneUrl: "https://prod.api.authsec.ai/",
  workspaceId: "884d366f-e801-4ac5-8a32-4f82de6dedd8",
  ingestToken: "aid_abc",
  accessGraph: true,
  resync: true,
  enforceNamespaces: "",
};

describe("the one-time setup command", () => {
  it("installs the published chart with every value filled in", () => {
    const cmd = k8sSetupCommand(setup);
    expect(cmd.split(" \\\n  ")).toEqual([
      `helm upgrade --install authsec-iga-agent ${IGA_AGENT_CHART} --version ${IGA_AGENT_CHART_VERSION} -n authsec-system --create-namespace`,
      "--set controlPlane.url=https://prod.api.authsec.ai",
      "--set workspace.id=884d366f-e801-4ac5-8a32-4f82de6dedd8",
      "--set cluster.name=prod-eks-us-east",
      "--set controlPlane.sourceToken=aid_abc",
      "--set accessGraph.enabled=true",
      "--set resync.enabled=true",
    ]);
    // Nothing to clone, nothing left to edit.
    expect(cmd).not.toMatch(/\.\/charts|<[a-z-]+>/);
  });

  it("adds the actuation role only when namespaces are named", () => {
    const cmd = k8sSetupCommand({ ...setup, accessGraph: false, resync: false, enforceNamespaces: "agents, ml" });
    expect(cmd).toContain('--set "roles={discovery,actuation}"');
    expect(cmd).toContain('--set "actuation.namespaces=agents ml"');
    expect(cmd).not.toMatch(/accessGraph|resync/);
    expect(k8sSetupCommand(setup)).not.toContain("actuation");
  });
});

describe("the cluster name", () => {
  it("is a DNS label", () => {
    expect(clusterNameProblem("")).toMatch(/Name the cluster/);
    expect(clusterNameProblem("Prod EKS")).toMatch(/Lowercase/);
    expect(clusterNameProblem("-prod")).toMatch(/Lowercase/);
    expect(clusterNameProblem("a".repeat(64))).toMatch(/at most 63/);
    expect(clusterNameProblem("k3s-master")).toBeNull();
  });
  it("never lets enforcement act in the agent's own namespace", () => {
    expect(enforceProblem("agents authsec-system")).toMatch(/own namespace/);
    expect(enforceProblem("")).toBeNull();
  });
});

describe("waiting for the cluster", () => {
  const src = (o: Partial<DiscoverySource>) => ({ kind: "k8s_webhook", self_registered: true, ...o }) as DiscoverySource;
  it("finds the agent's own registration, not a row made by hand", () => {
    const sources = [src({ id: "hand", instance_id: "k8s:prod", self_registered: false }), src({ id: "agent", instance_id: "k8s:prod" })];
    expect(connectedSource(sources, "prod")?.id).toBe("agent");
    expect(connectedSource(sources, "staging")).toBeUndefined();
    expect(connectedSource(undefined, "prod")).toBeUndefined();
  });
});
