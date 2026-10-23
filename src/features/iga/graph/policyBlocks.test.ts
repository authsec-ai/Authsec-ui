import { describe, expect, it } from "vitest";

import type { AccessLevel, AccessPolicy, AccessPolicyResource } from "@/app/api/igaAccessPoliciesApi";
import type { GraphNode, GraphRef } from "@/app/api/igaGraphApi";

import { coverage } from "./policyBlocks";

function policy(resource: Partial<AccessPolicyResource>, access: AccessLevel[]): AccessPolicy {
  return {
    id: "p-1",
    name: "p",
    effect: "block",
    access,
    status: "active",
    roles: [],
    resource: { resource_id: "", arn: "", bucket: "", prefix: "", account_id: "", provider: "aws", name: "", kind: "", ...resource },
  } as unknown as AccessPolicy;
}

function node(text: string, over: Partial<GraphNode> = {}): GraphNode {
  return { ref: "resource:n-1" as GraphRef, kind: "s3_bucket", label: text, text, ...over } as GraphNode;
}

describe("coverage on S3", () => {
  const whole = (access: AccessLevel[]) => policy({ bucket: "fin", name: "fin", arn: "arn:aws:s3:::fin" }, access);
  const folder = (access: AccessLevel[], prefix = "invoices/") => policy({ bucket: "fin", name: "fin", arn: "arn:aws:s3:::fin", prefix }, access);

  it("a whole-bucket policy covers the bucket and every path: fully for all, partly otherwise", () => {
    expect(coverage(whole(["all"]), node("arn:aws:s3:::fin"))).toBe("full");
    expect(coverage(whole(["all"]), node("arn:aws:s3:::fin/attachments/*"))).toBe("full");
    expect(coverage(whole(["read"]), node("arn:aws:s3:::fin"))).toBe("partial");
    expect(coverage(whole(["read", "write", "delete"]), node("arn:aws:s3:::fin/x.csv"))).toBe("partial");
  });

  it("a folder policy covers paths inside the folder by its access", () => {
    expect(coverage(folder(["all"]), node("arn:aws:s3:::fin/invoices/*"))).toBe("full");
    expect(coverage(folder(["all"]), node("arn:aws:s3:::fin/invoices/q3.csv"))).toBe("full");
    expect(coverage(folder(["read"]), node("arn:aws:s3:::fin/invoices/*"))).toBe("partial");
  });

  it("a folder policy covers the bucket, or a path above the folder, only partly", () => {
    expect(coverage(folder(["all"]), node("arn:aws:s3:::fin"))).toBe("partial");
    expect(coverage(folder(["all"]), node("arn:aws:s3:::fin/*"))).toBe("partial");
    expect(coverage(folder(["all"], "invoices/2026/"), node("arn:aws:s3:::fin/invoices/*"))).toBe("partial");
  });

  it("covers nothing elsewhere", () => {
    expect(coverage(folder(["all"]), node("arn:aws:s3:::fin/attachments/*"))).toBe("none");
    expect(coverage(whole(["all"]), node("arn:aws:s3:::other"))).toBe("none");
    expect(coverage(whole(["all"]), node("arn:aws:dynamodb:us-east-1:111122223333:table/fin", { kind: "dynamodb_table" } as Partial<GraphNode>))).toBe("none");
    expect(coverage(whole(["all"]), undefined)).toBe("none");
  });

  it("reads the node's ARN, then its label, when it has no text", () => {
    expect(coverage(whole(["all"]), node("", { text: undefined, arn: "arn:aws:s3:::fin" }))).toBe("full");
    expect(coverage(whole(["all"]), node("", { text: undefined, label: "arn:aws:s3:::fin" }))).toBe("full");
  });
});

describe("coverage on Azure", () => {
  const p = (access: AccessLevel[]) => policy({ provider: "azure", resource_id: "az-1", name: "kv" }, access);
  const azure = (id: string, over: Partial<GraphNode> = {}) =>
    node("kv", { ref: `resource:${id}` as GraphRef, provider: "azure", kind: "azure_resource", ...over } as Partial<GraphNode>);

  it("covers the named resource: fully for all, partly otherwise", () => {
    expect(coverage(p(["all"]), azure("az-1"))).toBe("full");
    expect(coverage(p(["read"]), azure("az-1"))).toBe("partial");
  });

  it("covers no other resource, kind or cloud", () => {
    expect(coverage(p(["all"]), azure("az-2"))).toBe("none");
    expect(coverage(p(["all"]), azure("az-1", { kind: "scope" } as Partial<GraphNode>))).toBe("none");
    expect(coverage(p(["all"]), node("arn:aws:s3:::fin", { ref: "resource:az-1" as GraphRef }))).toBe("none");
    expect(coverage(p(["all"]), undefined)).toBe("none");
  });
});

describe("coverage on DynamoDB", () => {
  const T = "arn:aws:dynamodb:us-east-1:111122223333:table/orders";
  const tbl = (access: AccessLevel[]) => policy({ resource_type: "dynamodb_table", name: "orders", arn: T }, access);

  it("a table policy covers the table, its indexes and streams: fully for all, partly otherwise", () => {
    expect(coverage(tbl(["all"]), node(T))).toBe("full");
    expect(coverage(tbl(["all"]), node(`${T}/index/by-date`))).toBe("full");
    expect(coverage(tbl(["read"]), node(`${T}/stream/2026`))).toBe("partial");
  });

  it("covers no other table, region, pattern or bucket", () => {
    expect(coverage(tbl(["all"]), node("arn:aws:dynamodb:us-east-1:111122223333:table/orders-archive"))).toBe("none");
    expect(coverage(tbl(["all"]), node("arn:aws:dynamodb:eu-west-1:111122223333:table/orders"))).toBe("none");
    expect(coverage(tbl(["all"]), node("arn:aws:dynamodb:us-east-1:111122223333:table/*"))).toBe("none");
    expect(coverage(tbl(["all"]), node("arn:aws:s3:::orders"))).toBe("none");
  });

  it("an S3 policy does not cover a table named like its bucket", () => {
    expect(coverage(policy({ bucket: "orders", name: "orders", arn: "arn:aws:s3:::orders" }, ["all"]), node(T))).toBe("none");
  });
});
