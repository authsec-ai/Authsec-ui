import { describe, expect, it } from "vitest";

import type { GcpBinding } from "@/app/api/cloudDiscoveryApi";

import { attachedText, capabilityText, conditionOf, expiryOf, isExternalIdentity, roleNote, shortAssetName } from "./gcpInventoryLabels";

function binding(over: Partial<GcpBinding>): GcpBinding {
  return {
    id: "b1",
    workspace_id: "ws",
    connector_id: "c",
    identity_id: "i",
    plane: "cloud",
    effect: "allow",
    actions: [],
    constraint_state: "unconstrained",
    scope_kind: "account_wide",
    derivation: "granted",
    sensitivity: "low",
    native_id: "//gcp/binding/x",
    last_seen_generation: 1,
    first_seen_at: "",
    last_seen_at: "",
    row_updated_at: "",
    identity_name: "contractor-sa",
    identity_kind: "gcp_service_account",
    identity_native_id: "x",
    ...over,
  } as GcpBinding;
}

describe("gcpInventoryLabels", () => {
  const now = Date.parse("2026-11-15T00:00:00Z");

  it("reads expiry from the stored bound, never from the CEL", () => {
    expect(expiryOf(binding({}), now).state).toBe("none");
    expect(expiryOf(binding({ attrs: { expires_at: "2026-01-01T00:00:00Z" } }), now).state).toBe("expired");
    expect(expiryOf(binding({ attrs: { expires_at: "2026-12-01T00:00:00Z" } }), now).state).toBe("expiring");
    expect(expiryOf(binding({ attrs: { expires_at: "2027-06-30T00:00:00Z" } }), now).state).toBe("active");
    expect(expiryOf(binding({ attrs: { expires_at: "not a date" } }), now).state).toBe("none");
  });

  it("keeps the condition verbatim", () => {
    const expr = 'request.time < timestamp("2027-06-30T00:00:00Z")';
    const c = conditionOf(binding({ condition: JSON.stringify({ title: "until mid 2027", expression: expr }) }));
    expect(c?.expression).toBe(expr);
    expect(c?.title).toBe("until mid 2027");
    expect(conditionOf(binding({ condition: null }))).toBeNull();
  });

  it("says where a binding is attached", () => {
    expect(attachedText(binding({ attrs: { gcp_scope_kind: "folder", attached_to: "//cloudresourcemanager.googleapis.com/folders/123" } }))).toBe("Folder folders/123");
    expect(
      attachedText(binding({ resource_id: "r", resource_kind: "gcs_bucket", resource_name: "", resource_native_id: "//storage.googleapis.com/projects/_/buckets/pub" })),
    ).toBe("Cloud Storage bucket buckets/pub");
    expect(shortAssetName("")).toBe("");
  });

  it("flags basic and unresolved roles", () => {
    expect(roleNote(binding({ attrs: { basic_role: true } }))).toMatch(/Basic role/);
    expect(roleNote(binding({ attrs: { role_unresolved: true } }))).toMatch(/not found/);
    expect(roleNote(binding({}))).toBeNull();
  });

  it("says what a trust edge lets its subject do", () => {
    expect(capabilityText(["act_as", "mint_token"])).toBe("run workloads as it, mint its tokens");
    expect(capabilityText(undefined)).toBe("");
  });

  it("reads is_external from GCP attrs, not the row", () => {
    expect(isExternalIdentity({ is_external: true })).toBe(true);
    expect(isExternalIdentity({})).toBe(false);
    expect(isExternalIdentity(null)).toBe(false);
  });
});
