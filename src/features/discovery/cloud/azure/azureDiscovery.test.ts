import { describe, expect, it } from "vitest";

import type { AzureFoundryTrust, AzureWorkload, CloudConnector } from "@/app/api/cloudDiscoveryApi";

import { armTypeLabel, foundryKindLabel, graphKindLabel, identityTabKeys, surfaceLabel } from "./azureDiscoveryLabels";
import { foundryCounts, foundryRowsOf, groupFoundry } from "./azureFoundry";
import { azureFallbackScope, identityFilterArgs, scanTablesHref } from "./azureFallback";
import { isPresentState, stateLabel, summarizeGraph } from "./azureGraphSummary";

describe("Azure resource types", () => {
  it("names the types discovery reads in Microsoft's words, case-insensitively", () => {
    expect(armTypeLabel("microsoft.keyvault/vaults")).toBe("Key Vault");
    expect(armTypeLabel("Microsoft.Storage/storageAccounts")).toBe("Storage account");
    expect(armTypeLabel("microsoft.containerservice/managedclusters")).toBe("Kubernetes cluster (AKS)");
    expect(armTypeLabel("microsoft.cognitiveservices/accounts/projects")).toBe("Foundry project");
  });

  it("falls back to the last segment and namespace for a type it does not know", () => {
    expect(armTypeLabel("microsoft.example/widgets")).toBe("Other Azure resource");
    expect(armTypeLabel("plain")).toBe("Other Azure resource");
  });

  it("labels each table of the graph summary by its own vocabulary", () => {
    expect(graphKindLabel("identity", "entra_agent_identity")).toBe("AI agent");
    expect(graphKindLabel("resource", "entra_app_role")).toBe("Application permission");
    expect(graphKindLabel("resource", "microsoft.sql/servers")).toBe("SQL server");
    expect(graphKindLabel("entitlement", "azure_role_definition")).toBe("Azure role");
    expect(graphKindLabel("access_edge", "azure_rbac")).toBe("Azure role assignment");
    expect(graphKindLabel("credential", "entra_certificate")).toBe("Certificate");
    expect(graphKindLabel("relationship", "can_assume")).toBe("Can obtain another identity's tokens");
    expect(graphKindLabel("relationship", "something_new")).toBe("something_new");
  });

  it("names the Teams and Foundry agent coverage surfaces", () => {
    expect(surfaceLabel("teams_apps")).toMatch(/Teams bots/);
    expect(surfaceLabel("foundry_agents")).toMatch(/Microsoft Foundry projects/);
    expect(surfaceLabel("brand_new_surface")).toBe("Other area (not yet described)");
  });

  it("names a Foundry kind, else its runtime type", () => {
    expect(foundryKindLabel("hub_project", "microsoft.machinelearningservices/workspaces")).toBe("AI project in a hub");
    expect(foundryKindLabel(undefined, "microsoft.machinelearningservices/workspaces")).toBe("Machine Learning workspace");
  });
});

describe("summarizeGraph", () => {
  const rows = [
    { table: "resource", kind: "microsoft.keyvault/vaults", state: "active", count: 3 },
    { table: "resource", kind: "microsoft.keyvault/vaults", state: "retired", count: 2 },
    { table: "resource", kind: "microsoft.storage/storageaccounts", state: "active", count: 5 },
    { table: "identity", kind: "entra_user", state: "active", count: 10 },
    { table: "access_edge", kind: "azure_rbac", state: "ended", count: 4 },
    { table: "access_edge", kind: "azure_rbac", state: "current", count: 1 },
    { table: "credential", kind: "entra_client_secret", state: "expired", count: 2 },
    { table: "workload", kind: "microsoft.web/sites", state: "active", count: 0 },
  ];

  it("orders tables as a reader meets them and drops empty ones", () => {
    expect(summarizeGraph(rows).map((s) => s.table)).toEqual(["identity", "resource", "access_edge", "credential"]);
  });

  it("counts what is still in Azure apart from what is gone", () => {
    const resources = summarizeGraph(rows).find((s) => s.table === "resource")!;
    expect(resources.present).toBe(8);
    expect(resources.total).toBe(10);
    expect(resources.kinds.map((k) => k.label)).toEqual(["Storage account", "Key Vault"]);
    expect(resources.kinds[1].byState).toEqual([
      { state: "active", count: 3 },
      { state: "retired", count: 2 },
    ]);
    const grants = summarizeGraph(rows).find((s) => s.table === "access_edge")!;
    expect(grants.present).toBe(1);
  });

  it("treats an expired credential as still there, an ended grant as gone", () => {
    expect(isPresentState("expired")).toBe(true);
    expect(isPresentState("ended")).toBe(false);
    expect(isPresentState("tombstoned")).toBe(false);
    expect(summarizeGraph(rows).find((s) => s.table === "credential")!.present).toBe(2);
  });

  it("keeps a table it does not know rather than hiding it", () => {
    const out = summarizeGraph([{ table: "new_table", kind: "k", state: "active", count: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("new table");
  });

  it("words a state", () => {
    expect(stateLabel("not_in_inventory")).toBe("Outside the scanned subscriptions");
    expect(stateLabel("tombstoned")).toBe("Deleted from Azure");
    expect(stateLabel("some_new_state")).toBe("Some new state");
    expect(stateLabel("")).toBe("Not stated");
  });
});

describe("Foundry grouping", () => {
  const wl = (id: string, connector: string, attrs: Record<string, unknown>, name = id): AzureWorkload => ({
    id,
    connector_id: connector,
    identity_name: "",
    identity_kind: "",
    runtime_kind: "microsoft.cognitiveservices/accounts",
    native_id: `/subscriptions/s/${id}`,
    name,
    region: "eastus",
    attrs,
    first_seen_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-20T00:00:00Z",
  });
  const account = wl("acct", "sub1", { foundry_kind: "account", resource_id: "/SUBS/A/ACCT", deployments: [{ name: "gpt" }, { name: "emb" }] }, "b-account");
  const project = wl("proj", "sub1", { foundry_kind: "project", account_id: "/subs/a/acct", principal_id: "MI-1", agent_applications: [{ name: "app", agents: ["a1", "a2"] }] });
  const orphan = wl("lost", "sub2", { foundry_kind: "project", account_id: "/subs/a/missing" }, "a-orphan");
  const hub = wl("hub", "sub2", { foundry_kind: "hub", resource_id: "/subs/b/hub" }, "c-hub");
  const hubProject = wl("hp", "sub2", { foundry_kind: "hub_project", hub_id: "/SUBS/B/HUB" });
  const trusts: AzureFoundryTrust[] = [
    { principal_id: "mi-1", trusted_identity_id: "t", trusted_name: "Blueprint", trusted_kind: "entra_application", trusted_agent_type: "agent_identity_blueprint" },
    { principal_id: "mi-2", trusted_identity_id: "u", trusted_name: "Other", trusted_kind: "entra_application", trusted_agent_type: "" },
  ];

  it("puts each project under its Foundry resource or hub, case-insensitively, and keeps orphans", () => {
    const nodes = groupFoundry([project, account, orphan, hubProject, hub], trusts);
    expect(nodes.map((n) => n.workload.id)).toEqual(["lost", "acct", "hub"]);
    expect(nodes[1].children.map((n) => n.workload.id)).toEqual(["proj"]);
    expect(nodes[2].children.map((n) => n.workload.id)).toEqual(["hp"]);
  });

  it("attaches only the trusts that name the object's own managed identity", () => {
    const proj = groupFoundry([account, project], trusts)[0].children[0];
    expect(proj.trusts.map((t) => t.trusted_name)).toEqual(["Blueprint"]);
  });

  it("counts objects, projects, deployments, agent applications and agents", () => {
    expect(foundryCounts(groupFoundry([account, project, orphan, hub, hubProject], trusts))).toEqual({
      objects: 5,
      projects: 3,
      deployments: 2,
      agentApplications: 1,
      agents: 2,
    });
  });

  it("narrows to one tenant by the subscriptions under it", () => {
    const connectors = [
      { id: "tenant", scope_kind: "tenant", scope_id: "TID", status: "active" },
      { id: "sub1", scope_kind: "subscription", scope_id: "s1", parent_scope_id: "tid", status: "active" },
      { id: "sub2", scope_kind: "subscription", scope_id: "s2", parent_scope_id: "other", status: "active" },
    ] as unknown as CloudConnector[];
    expect(foundryRowsOf([account, orphan], connectors, connectors[0]).map((w) => w.id)).toEqual(["acct"]);
    expect(foundryRowsOf([account, orphan], connectors, undefined)).toHaveLength(2);
  });
});

describe("Azure scan-table fallback", () => {
  const c = (id: string, scope_kind: string, scope_id: string, parent_scope_id?: string) => ({ id, scope_kind, scope_id, parent_scope_id, status: "active" }) as unknown as CloudConnector;
  const one = [c("t1", "tenant", "TENANT-1"), c("s1", "subscription", "sub-1", "tenant-1")];
  const two = [...one, c("t2", "tenant", "tenant-2"), c("s2", "subscription", "sub-2", "tenant-2")];

  it("reads every tenant unfiltered when no source is chosen", () => {
    expect(azureFallbackScope(two, "resources", undefined)).toEqual({ exact: true });
  });

  it("filters identities on the server by the tenant connector, case-insensitively", () => {
    expect(azureFallbackScope(two, "identities", "tenant-1")).toEqual({ connectorId: "t1", exact: true });
  });

  it("needs no filter for resources when the workspace has one tenant", () => {
    expect(azureFallbackScope(one, "workloads", "tenant-1")).toEqual({ exact: true });
  });

  it("narrows resources after reading when several tenants exist, keeping the tenant's own API-plane rows", () => {
    const s = azureFallbackScope(two, "resources", "tenant-1");
    expect(s.exact).toBe(false);
    expect([...(s.connectorIds ?? [])].sort()).toEqual(["s1", "t1"]);
  });

  it("matches nothing for a tenant it does not know", () => {
    expect(azureFallbackScope(two, "identities", "nope")).toEqual({ connectorIds: new Set(), exact: false });
  });

  it("turns the Identities filter into the route's kind and agent_type", () => {
    expect(identityFilterArgs("agent_identity_blueprint_principal")).toEqual({ kind: "entra_service_principal", agent_type: "agent_identity_blueprint_principal" });
    expect(identityFilterArgs("entra_user")).toEqual({ kind: "entra_user", agent_type: undefined });
    expect(identityFilterArgs("something_else")).toEqual({ kind: "something_else" });
    expect(identityFilterArgs(undefined)).toEqual({});
  });

  it("links resources and workloads by their ARM id, identities by object id", () => {
    const r = { native_id: "/subscriptions/s/rg/x" } as AzureWorkload;
    expect(scanTablesHref("workloads", r)).toBe("/iga/azure/workload/%2Fsubscriptions%2Fs%2Frg%2Fx");
    expect(scanTablesHref("identities", { native_id: "abc" } as AzureWorkload)).toBe("/iga/azure/identity/abc");
  });
});

describe("Azure identity tabs", () => {
  it("shows only the tabs Microsoft makes possible for the kind", () => {
    // An agent identity has no credentials of its own and runs on no Azure resource.
    expect(identityTabKeys("entra_agent_identity")).toEqual(["access", "token-access", "activity"]);
    expect(identityTabKeys("entra_service_principal")).toEqual(["access", "credentials", "token-access", "activity"]);
    expect(identityTabKeys("entra_application")).toEqual(["access", "credentials", "token-access"]);
    expect(identityTabKeys("entra_managed_identity")).toEqual(["access", "token-access", "activity", "workloads"]);
    expect(identityTabKeys("entra_user")).toEqual(["access", "activity"]);
    expect(identityTabKeys("entra_group")).toEqual(["access"]);
  });
});
