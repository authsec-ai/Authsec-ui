import { describe, expect, it } from "vitest";

import { TYPES_BY_PROVIDER, azureAgentEntraId, azureAgentFoundIn } from "@/features/iga/discovery/model";
import { typeLabel } from "@/features/iga/discovery/urlState";
import { RUNTIME_STATUS_LABELS, STATUS_LABELS, type DiscoveredAgent } from "@/app/api/discoveryApi";

import { AZURE_GLOSSARY, azureExplain } from "./azureGlossary";
import { foundryPlacement, identityDetailFields, workloadDetailFields } from "./azureDetails";
import { AZURE_IDENTITY_KINDS, grantSourceLabel, identityKindLabel, mechanismLabel } from "./azureDiscoveryLabels";

describe("Azure glossary", () => {
  it("explains every Azure Discovery tab by the name the tab shows", () => {
    for (const t of TYPES_BY_PROVIDER.azure) expect(azureExplain(typeLabel("azure", t)), t).toBeTruthy();
  });

  it("explains every agent status the All agents list shows", () => {
    for (const label of [...Object.values(STATUS_LABELS), ...Object.values(RUNTIME_STATUS_LABELS)]) expect(azureExplain(label), label).toBeTruthy();
  });

  it("explains the three Entra Agent ID views", () => {
    for (const v of ["Agent identities", "Agent identity blueprints", "Microsoft Foundry"]) expect(azureExplain(v)).toBeTruthy();
  });

  it("explains the All agents columns and every place an agent can be found in", () => {
    for (const t of ["Found in", "Entra identity", "Tenant", "Last seen"]) expect(azureExplain(t), t).toBeTruthy();
    const sources = ["entra_agent_id", "foundry_agent_application", "foundry_project_agent", "agent_registry", "teams_app_catalog", "azure_bot_service", "logic_apps_agent", "unheard_of"];
    for (const evidence_source of sources) {
      for (const evidence_mode of ["declared", "inferred"] as const) {
        const where = azureAgentFoundIn({ source: "azure", evidence_mode, metadata: { evidence_source } } as unknown as DiscoveredAgent);
        expect(azureExplain(where ?? ""), `${evidence_source}/${evidence_mode}`).toBeTruthy();
      }
    }
  });

  it("finds the Entra identity an Azure agent signs in as", () => {
    const agent = (metadata: Record<string, unknown>) => ({ source: "azure", metadata }) as unknown as DiscoveredAgent;
    expect(azureAgentEntraId(agent({ object_id: "oid-1" }))).toBe("oid-1");
    expect(azureAgentEntraId(agent({ registry: { agent_identity_id: "oid-2" } }))).toBe("oid-2");
    expect(azureAgentEntraId(agent({}))).toBeNull();
    expect(azureAgentEntraId({ source: "k8s_webhook", metadata: { object_id: "x" } } as unknown as DiscoveredAgent)).toBeNull();
  });

  it("keeps each explanation short", () => {
    for (const t of [...TYPES_BY_PROVIDER.azure.map((x) => typeLabel("azure", x)), "Sponsors", "Owners", "Unregistered"]) {
      expect((azureExplain(t) ?? "").length, t).toBeLessThanOrEqual(200);
    }
  });

  it("says nothing for a term it does not know", () => {
    expect(azureExplain("Something else")).toBeUndefined();
  });

  it("explains every label an Azure object page shows", () => {
    const labels = [
      ...AZURE_IDENTITY_KINDS.flatMap((k) => identityDetailFields(k).map((f) => f.label)),
      ...workloadDetailFields().map((f) => f.label),
      ...foundryPlacement(["projectName:p", "accountName:a", "resourceGroup:r", "subscriptionId:s"]).map((x) => x.label),
      ...AZURE_IDENTITY_KINDS.filter((k) => k !== "entra_agent_user").map(identityKindLabel),
      ...["directory_role", "application_permission", "delegated_permission", "rbac_role_assignment", "key_vault_access_policy"].map(grantSourceLabel),
      ...["oidc_federation", "entra_app_owner", "entra_app_registration", "agent_identity_blueprint", "agent_user"].map(mechanismLabel),
      "Object ID", "Tenant", "Account enabled", "Last sign-in", "Sponsors", "Owners", "Created by", "Resource ID", "Subscription", "Region", "Inherited",
    ];
    for (const l of labels) expect(azureExplain(l), l).toBeTruthy();
  });

  it("keeps every explanation under 170 characters", () => {
    for (const [term, text] of Object.entries(AZURE_GLOSSARY)) expect(text.length, term).toBeLessThanOrEqual(170);
  });
});
