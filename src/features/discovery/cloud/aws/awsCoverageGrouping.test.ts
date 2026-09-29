import { describe, expect, it } from "vitest";

import {
  coverageSeverity,
  coverageSurfaceGroup,
  COVERAGE_GROUPS,
  COVERAGE_GROUP_LABEL,
} from "./awsInventoryLabels";
import type { CloudCoverageState } from "@/app/api/cloudDiscoveryApi";

describe("coverageSurfaceGroup", () => {
  it("files the IAM phase under identities", () => {
    for (const k of ["iam_roles", "iam_users", "iam_access_keys", "iam_policies", "iam_credential_report"]) {
      expect(coverageSurfaceGroup(k)).toBe("identities");
    }
  });

  it("files the permission phase under permissions", () => {
    for (const k of ["oidc_providers", "eks_pod_identity", "resource_policies", "policy_documents", "permission_scan"]) {
      expect(coverageSurfaceGroup(k)).toBe("permissions");
    }
  });

  it("files per-region keys under compute without knowing the service", () => {
    // Only the compute phase writes "<surface>:<region>", so a service this
    // build has never heard of still lands in the right group.
    expect(coverageSurfaceGroup("lambda:us-east-1")).toBe("compute");
    expect(coverageSurfaceGroup("bedrock-agentcore:ap-south-1")).toBe("compute");
    expect(coverageSurfaceGroup("compute:eu-west-1")).toBe("compute");
    expect(coverageSurfaceGroup("some-future-service:af-south-1")).toBe("compute");
    expect(coverageSurfaceGroup("activity")).toBe("compute");
    expect(coverageSurfaceGroup("workload_scan")).toBe("compute");
  });

  it("does NOT guess a phase for an unrecognised flat key", () => {
    // Defaulting these to compute filed a future identity surface under
    // "Compute & activity", where it read as a compute gap. "Other" claims
    // nothing, matching how coverageSurfaceLabel falls back to the raw key.
    expect(coverageSurfaceGroup("sso_permission_sets")).toBe("other");
    expect(coverageSurfaceGroup("totally_unknown")).toBe("other");
  });

  it("has a label and a render slot for every group it can return", () => {
    for (const k of ["iam_roles", "oidc_providers", "lambda:us-east-1", "unknown_thing"]) {
      const g = coverageSurfaceGroup(k);
      expect(COVERAGE_GROUPS).toContain(g);
      expect(COVERAGE_GROUP_LABEL[g]).toBeTruthy();
    }
  });
});

describe("coverageSeverity", () => {
  it("ranks states that need action above clean ones", () => {
    expect(coverageSeverity("denied")).toBeGreaterThan(coverageSeverity("reached"));
    expect(coverageSeverity("throttled")).toBeGreaterThan(coverageSeverity("reached"));
    expect(coverageSeverity("constrained")).toBeGreaterThan(coverageSeverity("partial"));
  });

  it("ranks not_selected last, below every other state", () => {
    // There is one of these per unselected AWS region, and they are scope
    // choices rather than findings — they are what made the list unreadable.
    const others: CloudCoverageState[] = [
      "reached",
      "denied",
      "throttled",
      "not_configured",
      "unknown",
      "constrained",
      "stale",
      "partial",
      "unsupported",
    ];
    for (const s of others) {
      expect(coverageSeverity("not_selected")).toBeLessThan(coverageSeverity(s));
    }
  });

  it("sorts a mixed group worst-first", () => {
    const states: CloudCoverageState[] = ["not_selected", "reached", "denied", "partial"];
    const sorted = [...states].sort((a, b) => coverageSeverity(b) - coverageSeverity(a));
    expect(sorted).toEqual(["denied", "partial", "reached", "not_selected"]);
  });
});
