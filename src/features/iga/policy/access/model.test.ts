import { describe, expect, it } from "vitest";

import {
  accessBlurbs,
  allowRoleOf,
  azureNoDelete,
  bodyOf,
  bucketOf,
  draftCopy,
  draftOf,
  draftProblem,
  draftSubScope,
  draftType,
  emptyDraft,
  groupModels,
  k8sRolesOf,
  groupParameters,
  groupSecrets,
  groupSimple,
  groupTables,
  pathInBucket,
  pathReachesFolder,
  policySentence,
  reachesFolder,
  resourceText,
  suggestedName,
  modelOf,
  parameterOf,
  secretOf,
  simpleTargetOf,
  tableOf,
  withEffect,
  type DraftResource,
  type PolicyDraft,
  awsResourceOf,
  resourcePolicyHref,
} from "./model";
import { RESOURCE_TYPES, resourceTypeCopy, typeRules } from "./resourceTypes";
import type { AccessPolicyDetail, AccessPolicyResource } from "@/app/api/igaAccessPoliciesApi";
import type { ResourceRow } from "@/app/api/igaGraphApi";
import type { K8sGrant } from "@/app/api/k8sGraphApi";

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
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/st").read).toBe("Read blobs, queue messages, table entities and files.");
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/st/blobServices/default/containers/c")).toEqual({
      read: "Read blobs.",
      write: "Upload and overwrite blobs.",
      delete: "Delete blobs.",
    });
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/st/queueServices/default/queues/q").read).toBe(
      "Peek at and receive queue messages.",
    );
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/g/providers/Microsoft.ServiceBus/namespaces/ns/queues/q").write).toBe("Send messages.");
    expect(azureNoDelete("/subscriptions/s/resourceGroups/g/providers/Microsoft.EventHub/namespaces/ns")).toBe(true);
    expect(azureNoDelete("/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/st")).toBe(false);
    // Key Vault secrets are mapped (step 2): its own words.
    expect(accessBlurbs("azure", vault.arn)).toEqual({ read: "Read secret values.", write: "Set and update secrets.", delete: "Delete and purge secrets." });
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
  const keys = ["noun", "pill", "title", "hint", "label", "search", "loading", "empty", "error", "blurbs", "allHint", "untouched", "subScope"];
  it("every entry has every word, and a blurb for each level", () => {
    for (const [type, copy] of Object.entries(RESOURCE_TYPES)) {
      expect(Object.keys(copy).filter((k) => !["blockOnly", "noDelete", "workloads", "allowLevels"].includes(k)).sort(), type).toEqual([...keys].sort());
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

describe("DynamoDB tables", () => {
  const T = "arn:aws:dynamodb:us-east-1:111122223333:table/orders";

  it("tableOf reads the table any record names, as the backend does", () => {
    for (const text of [T, `${T}/index/by-date`, `${T}/index/*`, `${T}/stream/2026-10-01T00:00`, `${T}/*`, `${T}/backup/01234`]) {
      expect(tableOf(text)).toEqual({ partition: "aws", region: "us-east-1", account: "111122223333", table: "orders", arn: T });
    }
    expect(tableOf("arn:aws-cn:dynamodb:cn-north-1:111122223333:table/orders")?.partition).toBe("aws-cn");
    expect(tableOf("arn:aws-us-gov:dynamodb:us-gov-west-1:111122223333:table/orders")?.region).toBe("us-gov-west-1");
    for (const text of [
      "arn:aws:dynamodb:us-east-1:111122223333:table/*",
      "arn:aws:dynamodb:us-east-1:111122223333:table/ord*",
      "arn:aws:dynamodb:*:111122223333:table/orders",
      "arn:aws:dynamodb:us-east-1:11112222333:table/orders",
      "arn:aws:dynamodb::111122223333:global-table/orders",
      "arn:aws:s3:::orders",
    ]) {
      expect(tableOf(text)).toBeNull();
    }
  });

  it("groupTables makes one entry per table, its own record first, and skips patterns", () => {
    const row = (id: string, text: string) => ({ ref: `resource:${id}`, text, type: "selector" }) as unknown as ResourceRow;
    const tables = groupTables([
      row("idx", `${T}/index/*`),
      row("own", T),
      row("pat", "arn:aws:dynamodb:us-east-1:111122223333:table/ord*"),
      row("other", "arn:aws:dynamodb:eu-west-1:111122223333:table/audit"),
    ]);
    expect(tables.map((t) => t.name)).toEqual(["audit", "orders"]);
    const orders = tables[1];
    expect(orders).toMatchObject({ resource_id: "own", resource_type: "dynamodb_table", arn: T, account_id: "111122223333", region: "us-east-1", bucket: "" });
    expect(orders.records?.map((r) => r.id)).toEqual(["own", "idx"]);
  });

  const table: DraftResource = { provider: "aws", resource_id: "r-1", resource_type: "dynamodb_table", name: "orders", bucket: "", arn: T, account_id: "111122223333", region: "us-east-1" };

  it("a table policy sends no folder and asks for a table", () => {
    const d: PolicyDraft = { ...emptyDraft({ awsType: "dynamodb_table" }), prefix: "stale/" };
    expect(draftProblem(d)?.message).toBe("Choose a table.");
    expect(bodyOf({ ...d, resource: table }).resource).toEqual({ resource_id: "r-1", prefix: "" });
    expect(resourceText({ ...table, prefix: "" })).toBe("orders (us-east-1)");
  });

  it("every resource type has every word the form uses", () => {
    for (const copy of Object.values(RESOURCE_TYPES)) {
      for (const k of ["noun", "title", "hint", "label", "search", "loading", "empty", "error", "allHint", "untouched"] as const) {
        expect(copy[k]).toBeTruthy();
      }
      expect(Object.keys(copy.blurbs).sort()).toEqual(["delete", "read", "write"]);
    }
  });
});

describe("Azure data planes", () => {
  it("describes Key Vault and AI Search access in their own words", () => {
    expect(accessBlurbs("azure", "/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv1").read).toBe("Read secret values.");
    expect(accessBlurbs("azure", "/subscriptions/s/resourcegroups/rg/providers/microsoft.search/searchServices/srch").write).toBe("Upload and update documents.");
    expect(accessBlurbs("azure", "/subscriptions/s/resourcegroups/rg/providers/Microsoft.CognitiveServices/accounts/ai").read).toMatch(/^Call the models/);
    expect(accessBlurbs("azure", "/subscriptions/s/resourcegroups/rg/providers/microsoft.web/sites/app").read).toBe("Read the resource and its settings.");
  });
});

describe("Secrets Manager secrets", () => {
  const S = "arn:aws:secretsmanager:us-east-1:111122223333:secret:prod/db";

  it("secretOf reads the secret an ARN or a name selector names, as the backend does", () => {
    expect(secretOf(`${S}-AbCdEf`)).toEqual({ partition: "aws", region: "us-east-1", account: "111122223333", name: "prod/db", suffix: "AbCdEf", key: S });
    expect(secretOf(`${S}-??????`)).toMatchObject({ name: "prod/db", suffix: null, key: S });
    expect(secretOf(`${S}-abcdef-AbCdEf`)?.name).toBe("prod/db-abcdef");
    expect(secretOf("arn:aws-us-gov:secretsmanager:us-gov-west-1:111122223333:secret:a/_+=.@-b-AbCdEf")?.name).toBe("a/_+=.@-b");
    for (const text of [
      `${S}-*`,
      "arn:aws:secretsmanager:us-east-1:111122223333:secret:*",
      "arn:aws:secretsmanager:us-east-1:111122223333:secret:pr?d/db-??????",
      `${S}-?????`,
      S,
      `${S}-AbCdE`,
      "arn:aws:secretsmanager:*:111122223333:secret:prod/db-AbCdEf",
      "arn:aws:secretsmanager:us-east-1:11112222333:secret:prod/db-AbCdEf",
      "arn:aws:s3:::prod-db",
    ]) {
      expect(secretOf(text)).toBeNull();
    }
  });

  it("groupSecrets makes one entry per name and region, the secret's own ARN first", () => {
    const row = (id: string, text: string) => ({ ref: `resource:${id}`, text, type: "selector" }) as unknown as ResourceRow;
    const secrets = groupSecrets([
      row("sel", `${S}-??????`),
      row("own", `${S}-AbCdEf`),
      row("pat", `${S}-*`),
      row("west", "arn:aws:secretsmanager:us-west-2:111122223333:secret:prod/db-??????"),
      row("api", "arn:aws:secretsmanager:us-east-1:111122223333:secret:api-key-XyZ123"),
    ]);
    expect(secrets.map((s) => `${s.name} ${s.region}`)).toEqual(["api-key us-east-1", "prod/db us-east-1", "prod/db us-west-2"]);
    expect(secrets[1]).toMatchObject({ resource_id: "own", resource_type: "secretsmanager_secret", arn: `${S}-AbCdEf`, account_id: "111122223333" });
    expect(secrets[1].records?.map((r) => r.id)).toEqual(["own", "sel"]);
    expect(secrets[2]).toMatchObject({ resource_id: "west", arn: "arn:aws:secretsmanager:us-west-2:111122223333:secret:prod/db-??????" });
  });

  it("a secret takes a block only and reads as its name and region", () => {
    expect(RESOURCE_TYPES.secretsmanager_secret.blockOnly).toBe(true);
    expect(resourceTypeCopy("dynamodb_table")?.blockOnly).toBeUndefined();
    const secret: DraftResource = { provider: "aws", resource_id: "r-1", resource_type: "secretsmanager_secret", name: "prod/db", bucket: "", arn: `${S}-AbCdEf`, account_id: "111122223333", region: "us-east-1" };
    expect(resourceText({ ...secret, prefix: "" })).toBe("prod/db (us-east-1)");
    const d: PolicyDraft = { ...emptyDraft({ awsType: "secretsmanager_secret", effect: "allow" }), resource: secret };
    expect(withEffect(d, "block").effect).toBe("block");
    expect(draftProblem({ ...emptyDraft({ awsType: "secretsmanager_secret" }) })?.message).toBe("Choose a secret.");
  });
});

describe("SSM parameters", () => {
  const P = "arn:aws:ssm:us-east-1:111122223333:parameter/prod/db/password";

  it("parameterOf reads a parameter ARN as the backend does", () => {
    expect(parameterOf(P)).toEqual({ partition: "aws", region: "us-east-1", account: "111122223333", name: "/prod/db/password", arn: P });
    expect(parameterOf("arn:aws:ssm:us-east-1:111122223333:parameter/db")?.name).toBe("db");
    for (const text of [`${P}/*`, "arn:aws:ssm:us-east-1:111122223333:parameter/prod/db?", "arn:aws:ssm:us-east-1:111122223333:parameter/", "arn:aws:ssm:*:111122223333:parameter/prod", "arn:aws:ssm:us-east-1:111122223333:document/prod"]) {
      expect(parameterOf(text)).toBeNull();
    }
  });

  it("groupParameters makes one entry per parameter and skips patterns", () => {
    const row = (id: string, text: string) => ({ ref: `resource:${id}`, text, type: "ssm_parameter" }) as unknown as ResourceRow;
    const params = groupParameters([row("a", P), row("b", P), row("pat", "arn:aws:ssm:us-east-1:111122223333:parameter/prod/*"), row("c", "arn:aws:ssm:us-east-1:111122223333:parameter/api")]);
    expect(params.map((p) => p.name)).toEqual(["/prod/db/password", "api"]);
    expect(params[0]).toMatchObject({ resource_id: "a", resource_type: "ssm_parameter", arn: P });
    expect(params[0].records?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(RESOURCE_TYPES.ssm_parameter.blockOnly).toBe(true);
  });
});

describe("Bedrock", () => {
  const C = "anthropic.claude-3-5-sonnet-20240620-v1:0";

  it("modelOf reads a foundation model or a system inference profile of it", () => {
    expect(modelOf(`arn:aws:bedrock:us-east-1::foundation-model/${C}`)).toEqual({ partition: "aws", model: C });
    expect(modelOf(`arn:aws:bedrock:us-east-1:111122223333:inference-profile/us.${C}`)).toEqual({ partition: "aws", model: C });
    for (const text of [
      "arn:aws:bedrock:us-east-1::foundation-model/*",
      `arn:aws:bedrock:us-east-1:111122223333:inference-profile/xx.${C}`,
      "arn:aws:bedrock:us-east-1:111122223333:application-inference-profile/abc",
    ]) {
      expect(modelOf(text)).toBeNull();
    }
  });

  it("groupModels makes one entry per model, its foundation-model record first", () => {
    const row = (id: string, text: string) => ({ ref: `resource:${id}`, text, type: "selector", account: { id: "111122223333" } }) as unknown as ResourceRow;
    const models = groupModels([row("ip", `arn:aws:bedrock:us-east-1:111122223333:inference-profile/eu.${C}`), row("fm", `arn:aws:bedrock:us-west-2::foundation-model/${C}`)]);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ resource_id: "fm", resource_type: "bedrock_model", name: C, arn: `arn:aws:bedrock:*::foundation-model/${C}` });
    expect(resourceText({ ...models[0], prefix: "" })).toBe(C);
  });

  it("agents and runtimes come from workloads; a model has nothing to delete", () => {
    expect(RESOURCE_TYPES.bedrock_agent.workloads).toBe("bedrock_agent");
    expect(RESOURCE_TYPES.agentcore_runtime.workloads).toBe("bedrock_agentcore_runtime");
    expect(RESOURCE_TYPES.bedrock_model.noDelete).toBe(true);
  });
});

describe("Lambda, KMS, SQS and SNS", () => {
  const FN = "arn:aws:lambda:us-east-1:111122223333:function:book-flight";
  it("reads each type's ARN as the backend does", () => {
    expect(simpleTargetOf("lambda_function", `${FN}:prod`)).toEqual({ arn: FN, name: "book-flight", account: "111122223333", region: "us-east-1" });
    expect(simpleTargetOf("lambda_function", "arn:aws:lambda:us-east-1:111122223333:function:book-*")).toBeNull();
    expect(simpleTargetOf("kms_key", "arn:aws:kms:us-east-1:111122223333:alias/app")).toBeNull();
    expect(simpleTargetOf("kms_key", "arn:aws:kms:us-east-1:111122223333:key/mrk-1234abcd12ab34cd56ef1234567890ab")?.name).toBe("mrk-1234abcd12ab34cd56ef1234567890ab");
    expect(simpleTargetOf("sqs_queue", "arn:aws:sqs:us-east-1:111122223333:orders.fifo")?.name).toBe("orders.fifo");
    expect(simpleTargetOf("sns_topic", "arn:aws:sns:us-east-1:111122223333:alerts:0b1c2d3e-aaaa-bbbb-cccc-123456789012")).toBeNull();
  });
  it("groups a function's versions and aliases under it", () => {
    const row = (id: string, text: string) => ({ ref: `resource:${id}`, text, type: "lambda_function" }) as unknown as ResourceRow;
    const fns = groupSimple("lambda_function", [row("alias", `${FN}:prod`), row("own", FN), row("other", "arn:aws:lambda:us-east-1:111122223333:function:cancel")]);
    expect(fns.map((f) => f.name)).toEqual(["book-flight", "cancel"]);
    expect(fns[0].records?.map((r) => r.id)).toEqual(["own", "alias"]);
    expect(resourceText({ ...fns[0], prefix: "" })).toBe("book-flight (us-east-1)");
  });
  it("limits what an allow may name", () => {
    expect(RESOURCE_TYPES.lambda_function.allowLevels).toEqual(["read"]);
    expect(RESOURCE_TYPES.sns_topic.allowLevels).toEqual(["write"]);
    expect(RESOURCE_TYPES.kms_key.blockOnly).toBe(true);
  });
});

describe("typeRules", () => {
  it("prefers the server's description and falls back to the registry", () => {
    expect(typeRules(RESOURCE_TYPES.sns_topic)).toEqual({ blockOnly: false, noDelete: false, allowLevels: ["write"] });
    const view = { type: "sns_topic", service: "sns", noun: "topic", prefix: false, block_only: true, allow_levels: [], levels: ["read", "write"] } as const;
    expect(typeRules(RESOURCE_TYPES.sns_topic, { ...view, allow_levels: [], levels: ["read", "write"] })).toEqual({ blockOnly: true, noDelete: true, allowLevels: [] });
    expect(typeRules(RESOURCE_TYPES.s3_bucket, { ...view, block_only: false, allow_levels: ["read", "write", "delete"], levels: ["read", "write", "delete"] }).allowLevels).toBeUndefined();
  });
});

describe("Kubernetes", () => {
  it("k8sRolesOf lists each role once, with the bindings that carry it", () => {
    const g = (role_id: string | undefined, role_name: string, role_kind: string, namespace: string, binding_name: string) =>
      ({ role_id, role_name, role_kind, namespace, binding: "", binding_name }) as unknown as K8sGrant;
    const roles = k8sRolesOf([
      g("r1", "secret-reader", "k8s_role", "agents", "booker-secrets"),
      g("r1", "secret-reader", "k8s_role", "agents", "booker-secrets"),
      g("r2", "view", "k8s_cluster_role", "", "booker-view"),
      g(undefined, "missing", "", "", "dangling"),
    ]);
    expect(roles).toEqual([
      { role_id: "r1", label: "agents/secret-reader", kind: "Role", bindings: ["booker-secrets"] },
      { role_id: "r2", label: "view", kind: "ClusterRole", bindings: ["booker-view"] },
    ]);
  });
  it("a Kubernetes draft blocks all access only", () => {
    const d = withEffect(emptyDraft({ provider: "k8s" }), "allow");
    expect(d.effect).toBe("block");
    expect(d.access).toEqual(["all"]);
    expect(draftType(d)).toBe("k8s_role");
    expect(resourceText({ provider: "k8s", name: "agents/secret-reader", prefix: "" })).toBe("agents/secret-reader");
  });
});

describe("awsResourceOf (UI-052)", () => {
  const cases: [string, string, string][] = [
    ["arn:aws:s3:::acme/reports/*", "s3_bucket", "acme"],
    ["arn:aws:dynamodb:us-east-1:220171243705:table/acme-rag-embeddings", "dynamodb_table", "acme-rag-embeddings"],
    ["arn:aws:secretsmanager:us-east-1:220171243705:secret:legacy-summary-AbT3LD", "secretsmanager_secret", "legacy-summary"],
    ["arn:aws:ssm:us-east-1:220171243705:parameter/app/db", "ssm_parameter", "/app/db"],
    ["arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0", "bedrock_model", "anthropic.claude-3-haiku-20240307-v1:0"],
    ["arn:aws:lambda:us-east-1:220171243705:function:refund-tools", "lambda_function", "refund-tools"],
    ["arn:aws:kms:us-east-1:220171243705:key/0f3c5a8e-1b2c-4d5e-8f90-123456789abc", "kms_key", "0f3c5a8e-1b2c-4d5e-8f90-123456789abc"],
    ["arn:aws:sqs:us-east-1:220171243705:orders", "sqs_queue", "orders"],
    ["arn:aws:sns:us-east-1:220171243705:alerts", "sns_topic", "alerts"],
  ];
  it.each(cases)("fills the form from %s", (text, type, name) => {
    const got = awsResourceOf("rid", text);
    expect(got?.awsType).toBe(type);
    expect(got?.resource).toMatchObject({ provider: "aws", resource_id: "rid", resource_type: type, name });
  });

  it("keeps an S3 folder and names nothing it cannot", () => {
    expect(awsResourceOf("rid", "arn:aws:s3:::acme/reports/*")?.prefix).toBe("reports/");
    expect(awsResourceOf("rid", "arn:aws:apigateway:us-east-1::/apis/*")).toBeNull();
    expect(awsResourceOf("rid", "*")).toBeNull();
  });
});

describe("resourcePolicyHref (UI-052)", () => {
  const all = ["s3_bucket", "dynamodb_table", "lambda_function"];
  it("opens the form with the resource and its type", () => {
    expect(resourcePolicyHref("r1", "arn:aws:dynamodb:us-east-1:220171243705:table/acme", "dynamodb_table", all)).toBe(
      "/iga/policy/new?resource_id=r1&type=dynamodb_table",
    );
  });
  it("offers nothing the server does not take, or that no policy can name", () => {
    expect(resourcePolicyHref("r1", "arn:aws:sqs:us-east-1:220171243705:orders", "sqs_queue", all)).toBeNull();
    expect(resourcePolicyHref("r1", "arn:aws:apigateway:us-east-1::/apis/*", "apigateway", all)).toBeNull();
  });
});

describe("allowing a Kubernetes role from the policy form", () => {
  it("reads the role and the allowed roles off the agent's refusal", () => {
    expect(allowRoleOf({ code: "k8s_agent_cannot_act", message: "m", detail: { role: "llm-key-reader", allowed_roles: ["pod-reader", 3] } })).toEqual({
      role: "llm-key-reader",
      allowed: ["pod-reader"],
    });
    // The agent cannot change bindings at all, or another blocker: no command.
    expect(allowRoleOf({ code: "k8s_agent_cannot_act", message: "m" })).toBeNull();
    expect(allowRoleOf({ code: "k8s_policy_conflict", message: "m", detail: { role: "r" } })).toBeNull();
  });
});
