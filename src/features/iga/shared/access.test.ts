import { describe, expect, it } from "vitest";

import type { GrantLine, ResourceSummary, WorkloadResourceRow } from "@/app/api/igaGraphApi";

import { accessLevel, accessScope, broadText, countWord, grantViews, isBroad, isFullAdmin, matchesFilter, parseAccessFilter, summarizeAccess } from "./access";

const res = (text: string, kind: ResourceSummary["kind"], service: string | null = null): ResourceSummary => ({
  ref: `resource:${text}` as ResourceSummary["ref"],
  text,
  kind,
  type: "unknown",
  service,
  account: null,
  region: null,
});

const grant = (actions: string[], notActions: string[] = []): GrantLine =>
  ({
    claim: "grant:1",
    via_identity: "identity:1",
    policy: { ref: "policy:1", name: "p", kind: "inline" },
    statement: { ref: "statement:1", sid: "", index: 1, actions, not_actions: notActions, conditional: false },
    target_mode: "resource",
    exclusions: [],
    state: "current",
    valid_from: null,
    last_confirmed_at: null,
  }) as unknown as GrantLine;

const row = (resource: ResourceSummary, ...grants: GrantLine[]): WorkloadResourceRow => ({
  resource,
  grants,
  restrictions: { deny_statements: 0, permissions_boundary: false },
});

describe("accessScope", () => {
  it("calls a bare * 'all'", () => {
    expect(accessScope({ kind: "selector", text: "*" })).toBe("all");
  });

  it("calls a service-wide ARN wildcard 'all'", () => {
    expect(accessScope({ kind: "selector", text: "arn:aws:s3:::*" })).toBe("all");
  });

  it("calls every resource of one type 'all'", () => {
    expect(accessScope({ kind: "selector", text: "arn:aws:logs:us-east-1:429418377036:log-group:*" })).toBe("all");
    expect(accessScope({ kind: "selector", text: "arn:aws:dynamodb:us-east-1:429418377036:table/*" })).toBe("all");
  });

  it("calls an S3 path under one bucket a pattern, not 'all'", () => {
    expect(accessScope({ kind: "selector", text: "arn:aws:s3:::acme-iga-attachments-429418377036/attachments/*" })).toBe("pattern");
    // The word before the slash is a bucket the owner chose, not a type.
    expect(accessScope({ kind: "selector", text: "arn:aws:s3:::acme-bucket/*" })).toBe("pattern");
  });

  it("calls an exact reference specific and an external one other-account", () => {
    expect(accessScope({ kind: "exact", text: "arn:aws:secretsmanager:us-east-1:429418377036:secret:acme/legacy-summary-v2-vdpEhG" })).toBe("specific");
    expect(accessScope({ kind: "external", text: "arn:aws:s3:::other-account-bucket" })).toBe("other_account");
  });
});

describe("accessLevel", () => {
  it("reads Get/List/Describe as read", () => {
    expect(accessLevel(["secretsmanager:GetSecretValue", "s3:ListBucket", "ec2:DescribeInstances"])).toBe("read");
  });

  it("treats a verb-prefix wildcard at the verb's level", () => {
    expect(accessLevel(["s3:Get*"])).toBe("read");
  });

  it("calls anything that creates or changes write, and the highest wins", () => {
    expect(accessLevel(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"])).toBe("write");
    expect(accessLevel(["s3:GetObject", "s3:PutObject"])).toBe("write");
  });

  it("calls * and service:* full", () => {
    expect(accessLevel(["*"])).toBe("full");
    expect(accessLevel(["logs:*"])).toBe("full");
  });

  it("calls NotAction full whatever else is listed", () => {
    expect(accessLevel(["s3:GetObject"], ["iam:*"])).toBe("full");
  });

  it("never rounds an unclassifiable action down to read", () => {
    expect(accessLevel(["iam:PassRole"])).toBe("other");
    expect(accessLevel(["sts:AssumeRole"])).toBe("other");
    expect(accessLevel(["s3:GetObject", "iam:PassRole"])).toBe("other");
  });

  it("has no basis for a statement with no actions", () => {
    expect(accessLevel([])).toBe("other");
  });
});

describe("isBroad", () => {
  it("is broad on 'all' scope or full level", () => {
    expect(isBroad("all", "read")).toBe(true);
    expect(isBroad("specific", "full")).toBe(true);
  });

  it("does not flag a prefix pattern or a specific resource", () => {
    expect(isBroad("pattern", "read")).toBe(false);
    expect(isBroad("pattern", "write")).toBe(false);
    expect(isBroad("specific", "write")).toBe(false);
  });
});

describe("grantViews", () => {
  it("splits a bare-* resource's actions by their own service", () => {
    const views = grantViews(res("*", "selector"), grant(["logs:CreateLogGroup", "ssm:GetParameter"]));
    expect(views.map((v) => v.service).sort()).toEqual(["logs", "ssm"]);
    expect(views.find((v) => v.service === "logs")?.level).toBe("write");
    expect(views.find((v) => v.service === "ssm")?.level).toBe("read");
    expect(views.every((v) => v.broad)).toBe(true);
  });

  it("counts only this service's actions on a resource that names its service", () => {
    const g = grant(["s3:GetObject", "sqs:SendMessage", "kms:*"]);
    const s3 = grantViews(res("arn:aws:s3:::b/x/*", "selector", "s3"), g);
    expect(s3).toHaveLength(1);
    expect(s3[0]).toMatchObject({ service: "s3", level: "read", broad: false, actions: ["s3:GetObject"] });
    const sqs = grantViews(res("arn:aws:sqs:us-east-1:429418377036:q", "exact", "sqs"), g);
    expect(sqs[0]).toMatchObject({ service: "sqs", level: "write", actions: ["sqs:SendMessage"] });
  });

  it("keeps every action when none carries the resource's service prefix", () => {
    const v = grantViews(res("arn:aws:states:us-east-1:429418377036:stateMachine:m", "exact", "states"), grant(["sfn:StartExecution"]));
    expect(v[0].actions).toEqual(["sfn:StartExecution"]);
  });

  it("keeps a bare * action on every service's resource", () => {
    const v = grantViews(res("arn:aws:s3:::b/x/*", "selector", "s3"), grant(["*"]));
    expect(v[0]).toMatchObject({ level: "full", broad: true });
  });

  it("reads the service from the ARN when the resource names none", () => {
    const views = grantViews(res("arn:aws:s3:::b/attachments/*", "selector"), grant(["s3:GetObject"]));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ service: "s3", level: "read", scope: "pattern", broad: false });
  });
});

describe("access filter", () => {
  it("parses only known values, defaulting to all", () => {
    expect(parseAccessFilter("broad")).toBe("broad");
    expect(parseAccessFilter("nonsense")).toBe("all");
    expect(parseAccessFilter(null)).toBe("all");
  });

  it("keeps full access in the write filter so iam:* is never hidden", () => {
    expect(matchesFilter({ broad: true, level: "full" }, "write")).toBe(true);
    expect(matchesFilter({ broad: false, level: "write" }, "write")).toBe(true);
    expect(matchesFilter({ broad: false, level: "read" }, "write")).toBe(false);
  });

  it("filters broad and read independently", () => {
    expect(matchesFilter({ broad: true, level: "read" }, "broad")).toBe(true);
    expect(matchesFilter({ broad: true, level: "read" }, "read")).toBe(true);
    expect(matchesFilter({ broad: false, level: "other" }, "read")).toBe(false);
  });
});

describe("summarizeAccess — the legacy-summary lab workload", () => {
  const rows = [
    row(res("arn:aws:secretsmanager:us-east-1:429418377036:secret:acme/legacy-summary-v2-vdpEhG", "exact", "secretsmanager"), grant(["secretsmanager:GetSecretValue"])),
    row(res("arn:aws:s3:::acme-iga-attachments-429418377036/attachments/*", "selector", "s3"), grant(["s3:GetObject"])),
    row(res("*", "selector"), grant(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"])),
  ];

  it("finds three services and one broad permission", () => {
    const s = summarizeAccess(rows);
    expect(s.paths).toBe(3);
    expect(s.services.map((x) => x.service).sort()).toEqual(["logs", "s3", "secretsmanager"]);
    expect(s.broad).toBe(1);
  });

  it("puts the broad service first", () => {
    expect(summarizeAccess(rows).services[0].service).toBe("logs");
  });

  it("reports partial reads as 'at least'", () => {
    const s = summarizeAccess(rows, { partial: true });
    expect(s.partial).toBe(true);
    expect(countWord(s.broad, s.partial)).toBe("at least 1");
    expect(countWord(s.broad, false)).toBe("1");
  });

  it("counts a resource once per service even with two statements", () => {
    const r = row(res("arn:aws:s3:::b/x/*", "selector", "s3"), grant(["s3:GetObject"]), grant(["s3:PutObject"]));
    const s = summarizeAccess([r]).services[0];
    expect(s).toMatchObject({ service: "s3", resources: 1, grants: 2, level: "write" });
  });
});

describe("isFullAdmin", () => {
  it("flags Allow * on *", () => {
    expect(isFullAdmin({ effect: "allow", actions: ["*"], resources: ["*"] })).toBe(true);
    expect(isFullAdmin({ effect: "allow", actions: ["*:*"], resources: ["*"] })).toBe(true);
  });
  it("does not flag a Deny, a narrower action, or a narrower resource", () => {
    expect(isFullAdmin({ effect: "deny", actions: ["*"], resources: ["*"] })).toBe(false);
    expect(isFullAdmin({ effect: "allow", actions: ["s3:*"], resources: ["*"] })).toBe(false);
    expect(isFullAdmin({ effect: "allow", actions: ["*"], resources: ["arn:aws:s3:::bucket/*"] })).toBe(false);
  });
});

describe("isFullAdmin narrowing", () => {
  const base = { effect: "allow" as const, actions: ["*"], resources: ["*"] };
  it("is not flagged when a condition, an exclusion or a non-current state narrows it", () => {
    expect(isFullAdmin({ ...base, conditional: true })).toBe(false);
    expect(isFullAdmin({ ...base, excluded: true })).toBe(false);
    expect(isFullAdmin({ ...base, current: false })).toBe(false);
    expect(isFullAdmin({ ...base, conditional: false, excluded: false, current: true })).toBe(true);
  });
});

describe("broadText", () => {
  it("is null when nothing is broad", () => {
    expect(broadText({ service: "s3" })).toBeNull();
  });
  it("names the service and the reach", () => {
    expect(broadText({ service: "logs", broadShapes: [{ level: "write", scope: "all" }] })).toBe("Write access to all CloudWatch Logs resources");
  });
  it("says Allow * on * without a made-up service name", () => {
    expect(broadText({ service: "any", broadShapes: [{ level: "full", scope: "all" }] })).toBe("Full access to every resource in any service");
  });
  it("puts the widest reach first and lists both", () => {
    expect(
      broadText({ service: "s3", broadShapes: [{ level: "full", scope: "specific" }, { level: "read", scope: "all" }] }),
    ).toBe("Read access to all S3 resources; full access to a named S3 resource");
  });
});
