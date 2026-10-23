import { describe, expect, it } from "vitest";

import {
  accessBlurbs,
  bodyOf,
  bucketOf,
  draftCopy,
  draftOf,
  draftProblem,
  draftSubScope,
  draftType,
  emptyDraft,
  pathInBucket,
  pathReachesFolder,
  policySentence,
  reachesFolder,
  resourceText,
  suggestedName,
  type DraftResource,
  type PolicyDraft,
} from "./model";
import { RESOURCE_TYPES, resourceTypeCopy } from "./resourceTypes";
import type { AccessPolicyDetail, AccessPolicyResource } from "@/app/api/igaAccessPoliciesApi";

describe("pathReachesFolder", () => {
  it("whole-bucket holders and whole-bucket rules reach everything", () => {
    expect(pathReachesFolder("", "sandbox/")).toBe(true);
    expect(pathReachesFolder("attachments/*", "")).toBe(true);
  });
  it("a role limited to another folder does not reach this one", () => {
    expect(pathReachesFolder("attachments/*", "sandbox/")).toBe(false);
  });
  it("matches a path inside, above, or a wildcard over the folder", () => {
    expect(pathReachesFolder("sandbox/a.txt", "sandbox/")).toBe(true);
    expect(pathReachesFolder("sandbox/*", "sandbox/")).toBe(true);
    expect(pathReachesFolder("a/*", "a/b/")).toBe(true);
    expect(pathReachesFolder("sand*", "sandbox/")).toBe(true);
  });
  it("a sibling that only shares a leading letter does not match", () => {
    expect(pathReachesFolder("sandwich/*", "sandbox/")).toBe(false);
  });
  it("reachesFolder is true when any path reaches", () => {
    expect(reachesFolder(["attachments/*", "sandbox/x"], "sandbox/")).toBe(true);
    expect(reachesFolder(["attachments/*"], "sandbox/")).toBe(false);
    expect(reachesFolder([], "")).toBe(false);
  });
});

describe("policySentence", () => {
  const base = { roles: [{ name: "RoleA" }], resource: { bucket: "b", prefix: "" }, starts_at: null, ends_at: null };
  it("block reads 'blocked from reading'", () => {
    expect(policySentence({ ...base, effect: "block", access: ["read"] })).toContain("is blocked from reading on b");
  });
  it("allow reads 'allowed to read', never 'allowed to reading'", () => {
    const s = policySentence({ ...base, roles: [{ name: "A" }, { name: "B" }], effect: "allow", access: ["read", "write"] });
    expect(s).toContain("are allowed to read and write on b");
    expect(s).not.toContain("to reading");
  });
});

/* The S3 helpers, pinned as they are before other AWS resource types join them. */

const bucket: DraftResource = { provider: "aws", resource_id: "r-1", resource_type: "s3_bucket", name: "fin", bucket: "fin", arn: "arn:aws:s3:::fin", account_id: "111122223333" };
const vault: DraftResource = { provider: "azure", resource_id: "r-2", resource_type: "azure_resource", name: "kv", bucket: "", arn: "/subscriptions/s/resourceGroups/g/providers/Microsoft.KeyVault/vaults/kv", account_id: "s" };
const now = new Date("2026-10-23T10:00:00Z");

function draft(over: Partial<PolicyDraft>): PolicyDraft {
  return { ...emptyDraft(), preset: "none", reason: "incident 42", ...over };
}

describe("bucketOf", () => {
  it("reads a bucket ARN, a whole-bucket path and a folder path", () => {
    expect(bucketOf("arn:aws:s3:::finance-reports")).toEqual({ bucket: "finance-reports", prefix: "" });
    expect(bucketOf("arn:aws:s3:::finance-reports/*")).toEqual({ bucket: "finance-reports", prefix: "" });
    expect(bucketOf("arn:aws:s3:::finance-reports/invoices/*")).toEqual({ bucket: "finance-reports", prefix: "invoices/" });
    expect(bucketOf("arn:aws:s3:::finance-reports/invoices/2026/")).toEqual({ bucket: "finance-reports", prefix: "invoices/2026/" });
  });
  it("a key gives its folder; a wildcard inside a name gives the bucket", () => {
    expect(bucketOf("arn:aws:s3:::b-x/reports/q3.csv")).toEqual({ bucket: "b-x", prefix: "reports/" });
    expect(bucketOf("arn:aws:s3:::fin/sand*")).toEqual({ bucket: "fin", prefix: "" });
  });
  it("takes any AWS partition and trims the text", () => {
    expect(bucketOf("arn:aws-us-gov:s3:::gov.bucket")).toEqual({ bucket: "gov.bucket", prefix: "" });
    expect(bucketOf("  arn:aws:s3:::fin  ")).toEqual({ bucket: "fin", prefix: "" });
  });
  it("is null for anything that is not an S3 bucket", () => {
    expect(bucketOf(null)).toBeNull();
    expect(bucketOf(undefined)).toBeNull();
    expect(bucketOf("")).toBeNull();
    expect(bucketOf("arn:aws:s3:::*")).toBeNull();
    expect(bucketOf("arn:aws:s3:::ab")).toBeNull();
    expect(bucketOf("arn:aws:s3:::Upper")).toBeNull();
    expect(bucketOf("arn:aws:dynamodb:us-east-1:111122223333:table/orders")).toBeNull();
    expect(bucketOf(vault.arn)).toBeNull();
  });
});

describe("pathInBucket", () => {
  it("is empty for the bucket or all of it", () => {
    expect(pathInBucket("arn:aws:s3:::fin")).toBe("");
    expect(pathInBucket("arn:aws:s3:::fin/*")).toBe("");
  });
  it("is the folder pattern or key otherwise", () => {
    expect(pathInBucket("arn:aws:s3:::fin/attachments/*")).toBe("attachments/*");
    expect(pathInBucket("arn:aws:s3:::fin/reports/q3.csv")).toBe("reports/q3.csv");
  });
  it("reads text without the ARN head too", () => {
    expect(pathInBucket("fin/x")).toBe("x");
    expect(pathInBucket("fin")).toBe("");
  });
});

describe("resourceText", () => {
  it("is the bucket, or the bucket and folder", () => {
    expect(resourceText({ bucket: "fin", prefix: "" })).toBe("fin");
    expect(resourceText({ bucket: "fin", prefix: "invoices/" })).toBe("fin/invoices/");
    expect(resourceText({ name: "fin", prefix: "" })).toBe("fin");
    expect(resourceText({ prefix: "" })).toBe("");
  });
  it("is the Azure resource's name, else the last part of its id, and never a folder", () => {
    expect(resourceText({ provider: "azure", name: "kv", prefix: "x/" })).toBe("kv");
    expect(resourceText({ provider: "azure", arn: vault.arn, prefix: "" })).toBe("kv");
    expect(resourceText({ provider: "azure", prefix: "" })).toBe("");
  });
});

describe("accessBlurbs", () => {
  it("speaks of objects on AWS", () => {
    expect(accessBlurbs("aws")).toEqual({ read: "List the folder and read objects.", write: "Upload and overwrite objects.", delete: "Remove objects and their versions." });
    expect(accessBlurbs("aws", "arn:aws:s3:::fin")).toEqual(accessBlurbs("aws"));
  });
  it("speaks of blobs on Azure storage and of the resource elsewhere", () => {
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/st")).toEqual({
      read: "Read blobs.",
      write: "Upload and overwrite blobs.",
      delete: "Delete blobs.",
    });
    expect(accessBlurbs("azure", vault.arn)).toEqual({ read: "Read the resource and its settings.", write: "Change the resource.", delete: "Delete the resource." });
  });
});

describe("bodyOf", () => {
  it("sends the trimmed folder on AWS", () => {
    const b = bodyOf(draft({ resource: bucket, prefix: "  invoices/ ", roles: [{ identity_account_id: "ia-1", name: "RoleA" }], name: " n ", reason: " r " }));
    expect(b).toEqual({
      effect: "block",
      resource: { resource_id: "r-1", prefix: "invoices/" },
      roles: [{ identity_account_id: "ia-1" }],
      access: ["read"],
      starts_at: null,
      ends_at: null,
      name: "n",
      reason: "r",
    });
  });
  it("never sends a folder on Azure", () => {
    expect(bodyOf(draft({ provider: "azure", resource: vault, prefix: "invoices/" })).resource).toEqual({ resource_id: "r-2", prefix: "" });
  });
  it("sends an empty resource id without a resource", () => {
    expect(bodyOf(draft({ prefix: "x/" })).resource).toEqual({ resource_id: "", prefix: "x/" });
  });
});

describe("suggestedName", () => {
  const roleA = { identity_account_id: "ia-1", name: "RoleA" };
  const roleB = { identity_account_id: "ia-2", name: "RoleB" };
  it("is empty until a resource and a role are chosen", () => {
    expect(suggestedName(draft({ resource: bucket }))).toBe("");
    expect(suggestedName(draft({ roles: [roleA] }))).toBe("");
  });
  it("names the bucket and folder on AWS", () => {
    expect(suggestedName(draft({ resource: bucket, prefix: " invoices/ ", roles: [roleA] }))).toBe("Block RoleA on fin/invoices/");
    expect(suggestedName(draft({ effect: "allow", resource: bucket, roles: [roleA, roleB] }))).toBe("Allow RoleA and 1 more on fin");
  });
  it("names the Azure resource without a folder", () => {
    expect(suggestedName(draft({ provider: "azure", resource: vault, prefix: "x/", roles: [roleA] }))).toBe("Block RoleA on kv");
  });
});

describe("draftProblem", () => {
  const role = { identity_account_id: "ia-1", name: "RoleA" };
  it("asks for a bucket on AWS and a resource on Azure", () => {
    expect(draftProblem(draft({}), now)).toEqual({ field: "resource", message: "Choose a bucket." });
    expect(draftProblem(draft({ provider: "azure" }), now)).toEqual({ field: "resource", message: "Choose a resource." });
  });
  it("wants a folder to end with / on AWS only", () => {
    expect(draftProblem(draft({ resource: bucket, prefix: "invoices", roles: [role] }), now)).toEqual({ field: "prefix", message: "A folder ends with /, for example invoices/." });
    expect(draftProblem(draft({ resource: bucket, prefix: " invoices/ ", roles: [role] }), now)).toBeNull();
    expect(draftProblem(draft({ provider: "azure", resource: vault, prefix: "invoices", roles: [role] }), now)).toBeNull();
  });
  it("asks for the cloud's identities, the access and a reason, in order", () => {
    expect(draftProblem(draft({ resource: bucket }), now)).toEqual({ field: "roles", message: "Choose at least one role." });
    expect(draftProblem(draft({ provider: "azure", resource: vault }), now)).toEqual({ field: "roles", message: "Choose at least one identity." });
    expect(draftProblem(draft({ resource: bucket, roles: [role], access: [] }), now)).toEqual({ field: "access", message: "Choose what to block." });
    expect(draftProblem(draft({ resource: bucket, roles: [role], reason: " " }), now)).toEqual({ field: "reason", message: "Say why. It is kept in the history." });
  });
  it("an allow must end within 30 days", () => {
    expect(draftProblem(draft({ effect: "allow", resource: bucket, roles: [role] }), now)).toEqual({ field: "end", message: "Allowed access must end. Pick an end time." });
  });
});

describe("resource types", () => {
  const keys = ["noun", "title", "hint", "label", "search", "loading", "empty", "error", "blurbs", "allHint", "untouched", "subScope"];
  it("every entry has every word, and a blurb for each level", () => {
    for (const [type, copy] of Object.entries(RESOURCE_TYPES)) {
      expect(Object.keys(copy).sort(), type).toEqual([...keys].sort());
      for (const k of keys.filter((k) => k !== "blurbs" && k !== "subScope")) expect((copy as unknown as Record<string, string>)[k], `${type}.${k}`).toBeTruthy();
      expect(Object.keys(copy.blurbs).sort(), type).toEqual(["delete", "read", "write"]);
    }
  });
  it("S3 keeps a folder; Azure, unknown and inherited names have no entry", () => {
    expect(resourceTypeCopy("s3_bucket")?.subScope).toBe("folder");
    expect(resourceTypeCopy("azure_resource")).toBeUndefined();
    expect(resourceTypeCopy("")).toBeUndefined();
    expect(resourceTypeCopy(undefined)).toBeUndefined();
    expect(resourceTypeCopy("toString")).toBeUndefined();
  });
  it("a draft is S3 on AWS until another type is chosen, and Azure's resource on Azure", () => {
    expect(draftType(draft({}))).toBe("s3_bucket");
    expect(draftType(draft({ resource: bucket }))).toBe("s3_bucket");
    expect(draftType(draft({ resource: { ...bucket, resource_type: "" } }))).toBe("s3_bucket");
    expect(draftType(draft({ provider: "azure" }))).toBe("azure_resource");
    expect(draftCopy(draft({}))).toBe(RESOURCE_TYPES.s3_bucket);
    expect(draftCopy(draft({ provider: "azure", resource: vault }))).toBeUndefined();
  });
  it("only a type with a folder keeps the prefix", () => {
    expect(draftSubScope(draft({ resource: bucket, prefix: " a/ " }))).toBe("a/");
    expect(draftSubScope(draft({ provider: "azure", resource: vault, prefix: "a/" }))).toBe("");
  });
});

describe("draftOf", () => {
  const detail = (resource: Partial<AccessPolicyResource>) =>
    ({
      name: "p",
      reason: "r",
      effect: "block",
      access: ["read"],
      starts_at: null,
      ends_at: null,
      roles: [],
      resource: { resource_id: "r-1", resource_type: "s3_bucket", arn: "arn:aws:s3:::fin", bucket: "fin", prefix: "a/", account_id: "1", provider: "aws", name: "fin", kind: "s3_bucket", ...resource },
    }) as unknown as AccessPolicyDetail;
  it("keeps the resource's type and region", () => {
    expect(draftOf(detail({})).resource).toMatchObject({ resource_type: "s3_bucket", bucket: "fin", name: "fin" });
    expect(draftOf(detail({ region: "us-east-1" })).resource?.region).toBe("us-east-1");
  });
  it("reads a resource without a type as S3 on AWS and Azure's on Azure", () => {
    expect(draftOf(detail({ resource_type: undefined })).resource?.resource_type).toBe("s3_bucket");
    expect(draftOf(detail({ resource_type: "" })).resource?.resource_type).toBe("s3_bucket");
    expect(draftOf(detail({ resource_type: undefined, provider: "azure", bucket: "", prefix: "" })).resource?.resource_type).toBe("azure_resource");
  });
});
