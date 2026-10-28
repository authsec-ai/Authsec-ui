import { describe, expect, it } from "vitest";

import type { AzureIdentity } from "@/app/api/cloudDiscoveryApi";

import { agentDisplayName, agentOrigin, isFoundryProjectIdentity, usesAgentIdentity } from "./azureAgentSource";

const id = (kind: string, attrs: Record<string, unknown>, name = "x") => ({ kind, attrs, name, native_id: "00000000-0000-0000-0000-000000000000" }) as unknown as AzureIdentity;
const SUB = "/subscriptions/6811c717/resourcegroups/rg/providers/microsoft.cognitiveservices/accounts/acct";

describe("agents as the Entra admin center lists them", () => {
  it("counts a Foundry project's managed identity as an agent with no agent identity", () => {
    const project = id("entra_managed_identity", { managed_identity_resource: `${SUB}/projects/proj-01` }, "acct/projects/proj-01");
    expect(isFoundryProjectIdentity(project)).toBe(true);
    expect(usesAgentIdentity(project)).toBe(false);
    expect(agentDisplayName(project)).toBe("proj-01");
    expect(agentOrigin(project, "identity")).toBe("Foundry project · managed identity");
  });

  it("does not count the Foundry resource's own identity, or any other managed identity", () => {
    expect(isFoundryProjectIdentity(id("entra_managed_identity", { managed_identity_resource: SUB }))).toBe(false);
    expect(isFoundryProjectIdentity(id("entra_managed_identity", { managed_identity_resource: "/subscriptions/s/resourcegroups/rg/providers/microsoft.web/sites/app" }))).toBe(false);
  });

  it("names a Foundry agent identity by its agent, or its project when shared", () => {
    const agent = id("entra_agent_identity", { tags: ["agentName:sales-bot", "projectName:proj-01", "accountName:acct"] }, "acct-proj-01-sales-bot-AgentIdentity");
    expect(usesAgentIdentity(agent)).toBe(true);
    expect(agentDisplayName(agent)).toBe("sales-bot");
    expect(agentOrigin(agent, "identity")).toBe("Foundry agent · proj-01");
    const shared = id("entra_agent_identity", { tags: ["projectName:proj-01", "accountName:acct"] });
    expect(agentDisplayName(shared)).toBe("proj-01");
    expect(agentOrigin(shared, "blueprint")).toBe("Foundry · shared project blueprint");
  });

  it("says who made one directly in Entra", () => {
    const entra = id("entra_agent_identity", { created_by: { by: "amankumar@authnull.com" } }, "sales agents");
    expect(agentDisplayName(entra)).toBe("sales agents");
    expect(agentOrigin(entra, "identity")).toBe("Entra · created by amankumar@authnull.com");
  });
});
