import { describe, expect, it } from "vitest";

import {
  azureTargetable,
  bodyOf,
  deploymentView,
  draftOf,
  draftProblem,
  emptyDraft,
  inCloud,
  isArmResource,
  policyProvider,
  policySentence,
  resourceText,
  subscriptionOf,
  type PolicyDraft,
} from "./model";
import type { AccessPolicyDetail } from "@/app/api/igaAccessPoliciesApi";

const STORE = "/subscriptions/6811C717-818d-4c35-9109-a20cab48e234/resourceGroups/rg-agent-test/providers/Microsoft.Storage/storageAccounts/agentigateststore01";

describe("Azure access policies: the model", () => {
  it("tells an Azure policy from an AWS one", () => {
    expect(policyProvider({ resource: { bucket: "refunds", arn: "arn:aws:s3:::refunds" } })).toBe("aws");
    expect(policyProvider({ resource: { bucket: "", arn: STORE } })).toBe("azure");
    // The list and detail name an Azure resource by its display name, with no bucket.
    expect(policyProvider({ resource: { bucket: "", arn: "agentigateststore01" } })).toBe("azure");
    expect(policyProvider({ resource: { bucket: "", arn: "x" }, roles: [{ arn: "azure:project-mi" }] })).toBe("azure");
  });

  it("names an Azure resource by its last segment, an S3 bucket as before", () => {
    expect(resourceText({ bucket: "", prefix: "", arn: STORE })).toBe("agentigateststore01");
    expect(resourceText({ bucket: "", prefix: "", arn: "agentigateststore01" })).toBe("agentigateststore01");
    expect(resourceText({ bucket: "finance", prefix: "invoices/" })).toBe("finance/invoices/");
  });

  it("reads the subscription out of an ARM id, lowercased", () => {
    expect(subscriptionOf(STORE)).toBe("6811c717-818d-4c35-9109-a20cab48e234");
    expect(subscriptionOf("not an arm id")).toBe("");
  });

  it("only offers ARM resources, not resource groups or subscriptions", () => {
    expect(isArmResource(STORE)).toBe(true);
    expect(isArmResource("/subscriptions/s/resourceGroups/rg")).toBe(false);
    expect(isArmResource("/subscriptions/s")).toBe(false);
    expect(isArmResource("entra_app_role:abc")).toBe(false);
  });

  it("targets what the backend accepts: service principals, managed identities and agent identities", () => {
    expect(azureTargetable("entra_managed_identity")).toBe(true);
    expect(azureTargetable("entra_agent_identity")).toBe(true);
    expect(azureTargetable("entra_service_principal")).toBe(true);
    expect(azureTargetable("entra_user")).toBe(false);
    expect(azureTargetable("entra_group")).toBe(false);
  });

  const azureDraft = (over: Partial<PolicyDraft> = {}): PolicyDraft => ({
    ...emptyDraft({ provider: "azure" }),
    resource: { resource_id: "r1", bucket: "agentigateststore01", arn: STORE, account_id: subscriptionOf(STORE), kind: "microsoft.storage/storageaccounts" },
    roles: [{ identity_account_id: "i1", name: "project-mi" }],
    reason: "test",
    ...over,
  });

  it("never sends a prefix for Azure, which the server refuses", () => {
    expect(bodyOf(azureDraft({ prefix: "leftover/" })).resource).toEqual({ resource_id: "r1", prefix: "" });
  });

  it("asks for a resource and identities in Azure's words", () => {
    expect(draftProblem(azureDraft({ resource: null }))?.message).toBe("Choose an Azure resource.");
    expect(draftProblem(azureDraft({ roles: [] }))?.message).toBe("Choose at least one identity.");
    // A stray prefix is not a problem for Azure: it is not sent.
    expect(draftProblem(azureDraft({ prefix: "no-slash" }))).toBeNull();
  });

  it("says the rule about the resource's name", () => {
    const d = azureDraft();
    expect(policySentence({ ...d, resource: { bucket: d.resource!.bucket, prefix: "" }, starts_at: null, ends_at: null })).toBe(
      "project-mi is blocked from reading on agentigateststore01 until the policy is ended.",
    );
  });

  it("edits an Azure policy as an Azure draft, named by the resource", () => {
    const p = {
      id: "p1",
      name: "Block project-mi",
      reason: "test",
      effect: "block",
      access: ["read"],
      starts_at: null,
      ends_at: null,
      resource: { resource_id: "r1", arn: "agentigateststore01", bucket: "", prefix: "", account_id: "6811c717" },
      roles: [{ identity_account_id: "i1", name: "project-mi", arn: "azure:project-mi", account_id: "6811c717", used_by: [] }],
    } as unknown as AccessPolicyDetail;
    const d = draftOf(p);
    expect(d.provider).toBe("azure");
    expect(d.resource?.bucket).toBe("agentigateststore01");
  });

  it("says where a deployment is in the policy's own cloud", () => {
    expect(deploymentView("active", "azure").label).toBe("In Azure");
    expect(deploymentView("outcome_unknown", "azure").label).toBe("Checking Azure");
    expect(deploymentView("active").label).toBe("In AWS");
  });

  it("says AWS text in Azure's words for an Azure policy only", () => {
    expect(inCloud("removing from AWS", "azure")).toBe("removing from Azure");
    expect(inCloud("removing from AWS", "aws")).toBe("removing from AWS");
    expect(inCloud("AWSome", "azure")).toBe("AWSome");
  });
});
