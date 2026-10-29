import { describe, expect, it } from "vitest";

import type { DiscoverySource } from "@/app/api/discoveryApi";

import { agentReadiness, helmEnforcementCommand, helmRemoveRoleCommand, inUseText, installProblem, k8sEnforcementState, statusLine } from "./k8sEnforcement";

const src = (o: Partial<DiscoverySource>) => o as DiscoverySource;
const managed = { runtime: { actuation_credential: "managed" } };

describe("k8sEnforcementState", () => {
  it("is off until it is turned on", () => {
    const s = k8sEnforcementState(src({ actuation_state: "off" }));
    expect([s.state, s.quarantine, s.accessPolicies]).toEqual(["off", "off", "off"]);
  });
  it("waits for the agent while pending", () => {
    const s = k8sEnforcementState(src({ actuation_state: "pending", actuation_enabled_at: "x", enforcement_mode: "observe" }));
    expect([s.state, s.quarantine, s.accessPolicies]).toEqual(["pending", "not_reported", "not_reported"]);
  });
  it("reads what the agent reported once on", () => {
    const s = k8sEnforcementState(src({ actuation_state: "on", actuation_enabled_at: "x", enforcement_mode: "observe", enforcement_bindings: true }));
    expect([s.quarantine, s.accessPolicies, s.mode]).toEqual(["on", "on", "observe"]);
    expect(k8sEnforcementState(src({ actuation_state: "on", enforcement_mode: "" })).quarantine).toBe("not_reported");
  });
  it("reads a minted token as on from a control plane older than the hand-over", () => {
    expect(k8sEnforcementState(src({ actuation_enabled_at: "x" })).state).toBe("on");
    expect(k8sEnforcementState(src({})).state).toBe("off");
  });
});

describe("whether the agent can take enforcement up", () => {
  it("reads the credential mode the agent reports", () => {
    expect(agentReadiness(src(managed))).toBe("ready");
    expect(agentReadiness(src({ runtime: { actuation_credential: "fixed" } }))).toBe("manual");
    expect(agentReadiness(src({ runtime: { actuation_credential: "none" } }))).toBe("no_role");
    // 0.5.0 and older report nothing.
    expect(agentReadiness(src({ runtime: { pod: "p" } }))).toBe("upgrade");
    expect(agentReadiness(src({ runtime: null }))).toBe("upgrade");
  });
  it("says what blocks a pending hand-over", () => {
    const line = (o: Partial<DiscoverySource>) => statusLine(k8sEnforcementState(src({ actuation_state: "pending", ...o })), "0.5.0");
    expect(line(managed)).toMatch(/next heartbeat/);
    expect(line({ runtime: { actuation_credential: "none" } })).toMatch(/actuation role/);
    expect(line({ runtime: {} })).toBe("Turned on, but this agent (v0.5.0) predates the hand-over. Upgrade it to iga-agent 0.6.0 with the command below.");
  });
});

describe("the command that lets the agent act", () => {
  const base = { chartRef: "", quarantineNamespaces: "agent-live-demo, iga-demo", bindingRoles: "", bindingNamespaces: "", clusterWide: false };

  it("grants the role and namespaces; no token anywhere", () => {
    const helm = helmEnforcementCommand(base);
    expect(helm).toContain("--reset-then-reuse-values");
    expect(helm).not.toContain("--reuse-values ");
    expect(helm).toContain('--set "roles={discovery,actuation}"');
    expect(helm).toContain('--set "actuation.namespaces=agent-live-demo iga-demo"');
    // A token given by hand would take precedence over the agent's own.
    expect(helm).toContain('--set actuation.existingSecret=""');
    expect(helm).not.toMatch(/authsec_act_|controlPlane|kubectl/);
    expect(helm).not.toContain("bindings");
  });

  it("moves an agent off a token given by hand back to its ingest token", () => {
    const helm = helmEnforcementCommand({ ...base, ingestSecret: "authsec-iga-ingest" });
    expect(helm).toContain("--set controlPlane.existingSecret=authsec-iga-ingest");
    expect(helm).toContain("--set controlPlane.existingSecretKey=sourceToken");
    expect(installProblem({ ...base, ingestSecret: " " })).toMatch(/ingest token/);
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
  it("offers to remove the role, and nothing else is needed", () => {
    const cmd = helmRemoveRoleCommand("");
    expect(cmd).toContain('--set "roles={discovery}"');
    expect(cmd).toContain("--set enforcement.bindings.enabled=false");
    expect(cmd).not.toMatch(/controlPlane|kubectl/);
  });
});
