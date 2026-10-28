import { describe, expect, it } from "vitest";

import type { DiscoverySource } from "@/app/api/discoveryApi";

import { helmDisableCommand, helmEnforcementCommand, inUseText, installProblem, k8sEnforcementState, secretCommand } from "./k8sEnforcement";

const src = (o: Partial<DiscoverySource>) => o as DiscoverySource;

describe("k8sEnforcementState", () => {
  it("is off without an actuation token", () => {
    const s = k8sEnforcementState(src({}));
    expect([s.actuation, s.quarantine, s.accessPolicies]).toEqual([false, "off", "off"]);
  });
  it("waits for the agent to report after the token is minted", () => {
    const s = k8sEnforcementState(src({ actuation_enabled_at: "2026-10-28T10:00:00Z", enforcement_mode: "" }));
    expect([s.quarantine, s.accessPolicies]).toEqual(["not_reported", "not_reported"]);
  });
  it("reads what the agent reported", () => {
    const s = k8sEnforcementState(src({ actuation_enabled_at: "x", enforcement_mode: "observe", enforcement_bindings: true }));
    expect([s.quarantine, s.accessPolicies, s.mode]).toEqual(["on", "on", "observe"]);
    expect(k8sEnforcementState(src({ actuation_enabled_at: "x", enforcement_mode: "observe" })).accessPolicies).toBe("off");
  });
});

describe("enforcement install commands", () => {
  const base = { chartRef: "", quarantineNamespaces: "agent-demo, iga-demo", bindingRoles: "", bindingNamespaces: "", clusterWide: false };

  it("keeps the token out of Helm values", () => {
    const helm = helmEnforcementCommand(base);
    expect(helm).toContain("--reuse-values");
    expect(helm).toContain('--set "roles={discovery,actuation}"');
    expect(helm).toContain("--set actuation.existingSecret=authsec-iga-actuation");
    // Discovery must send the same token once it exists, or the server refuses it.
    expect(helm).toContain("--set controlPlane.existingSecret=authsec-iga-actuation");
    expect(helm).toContain("--set controlPlane.existingSecretKey=actuationToken");
    expect(helm).toContain('--set "actuation.namespaces=agent-demo iga-demo"');
    expect(helm).not.toMatch(/authsec_act_|--from-literal/);
    expect(helm).not.toContain("bindings");
    expect(secretCommand("authsec_act_abc")).toContain("--from-literal=actuationToken=authsec_act_abc");
  });

  it("turns access policies on only for the roles named", () => {
    const helm = helmEnforcementCommand({ ...base, bindingRoles: "secret-reader", bindingNamespaces: "iga-test" });
    expect(helm).toContain("--set enforcement.bindings.enabled=true");
    expect(helm).toContain('--set "enforcement.bindings.roles=secret-reader"');
    expect(helm).toContain('--set "enforcement.bindings.namespaces=iga-test"');
    expect(helm).not.toContain("clusterWide");
  });

  it("says what is missing", () => {
    expect(installProblem({ ...base, quarantineNamespaces: "" })).toMatch(/at least one namespace/);
    expect(installProblem({ ...base, bindingRoles: "r" })).toMatch(/RoleBindings/);
    expect(installProblem({ ...base, bindingRoles: "r", clusterWide: true })).toBeNull();
    expect(installProblem({ ...base, quarantineNamespaces: "authsec-system" })).toMatch(/own namespace/);
    expect(installProblem(base)).toBeNull();
  });
});

describe("turning enforcement off", () => {
  it("says what is still in force", () => {
    expect(inUseText({ quarantined: 1, access_policies: 2, open_instructions: 0 })).toBe(
      "Still in force on this cluster: 1 quarantined agent (release it), 2 live access policies (end them). Turned off now, the agent could not undo them.",
    );
    expect(inUseText(undefined)).toMatch(/could not be turned off/);
  });
  it("switches the agent back to discovery under its ingest token", () => {
    const cmd = helmDisableCommand("", "");
    expect(cmd).toContain('--set "roles={discovery}"');
    expect(cmd).toContain("--set controlPlane.existingSecret=authsec-iga-ingest");
    expect(cmd).toContain("--set controlPlane.existingSecretKey=sourceToken");
    expect(cmd).toContain("--set enforcement.bindings.enabled=false");
    expect(cmd).toMatch(/\nkubectl delete secret authsec-iga-actuation -n authsec-system$/);
  });
});
