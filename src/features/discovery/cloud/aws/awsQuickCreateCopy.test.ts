import { describe, expect, it } from "vitest";

import { previousStackHint, quickCreateErrorCopy, regionProbeCopy } from "./awsQuickCreateCopy";
import { awsRegionLabel } from "./awsRegions";

describe("quickCreateErrorCopy", () => {
  it("has copy for every code the backend can send", () => {
    // services/cloud_aws_quickcreate.go — AWSOnbCode*
    const codes = [
      "aws_onb_not_configured",
      "aws_onb_invalid_regions",
      "aws_onb_session_store_unavailable",
      "aws_onb_template_missing",
      "aws_onb_unknown_link",
      "aws_onb_wrong_workspace",
      "aws_onb_region_mismatch",
      "aws_onb_account_mismatch",
      "aws_onb_invalid_request",
      "aws_onb_link_used",
      "aws_onb_too_many_attempts",
      "aws_onb_assume_denied",
      "aws_onb_authsec_unavailable",
    ];
    for (const code of codes) {
      expect(quickCreateErrorCopy(code, "x").title).not.toBe("Something went wrong");
    }
  });

  it("shows the backend's own message for region errors, which name the region", () => {
    const c = quickCreateErrorCopy("aws_onb_invalid_regions", "us-gov-west-1 is a GovCloud or China region");
    expect(c.body).toContain("us-gov-west-1");
  });

  it("falls back to the backend message for an unknown code, never an invented cause", () => {
    expect(quickCreateErrorCopy("aws_onb_new_thing", "raw message").body).toBe("raw message");
  });

  it("says a failure on AuthSec's side is not the customer's", () => {
    expect(quickCreateErrorCopy("aws_onb_authsec_unavailable", undefined).body).toMatch(/AuthSec's side/);
  });
});

describe("region copy", () => {
  it("names regions with code and place", () => {
    expect(awsRegionLabel("ap-south-1")).toBe("ap-south-1 — Asia Pacific (Mumbai)");
    expect(awsRegionLabel("af-south-1")).toBe("af-south-1 — Africa (Cape Town)");
    expect(awsRegionLabel("xx-new-1")).toBe("xx-new-1");
  });

  it("explains each unreachable reason", () => {
    expect(regionProbeCopy("region_disabled")).toMatch(/enable this Region/);
    expect(regionProbeCopy("blocked")).toMatch(/SCP/);
  });
});

describe("previousStackHint", () => {
  it("names the old stack when AuthSec named the role", () => {
    expect(previousStackHint("arn:aws:iam::1:role/AuthSecCloudDiscovery-abcd2345")).toBe(
      "delete its stack, AuthSec-Discovery-abcd2345",
    );
  });
  it("falls back when the role was created by hand or renamed", () => {
    expect(previousStackHint("arn:aws:iam::1:role/AuthSecCloudDiscovery")).toMatch(/stack you created/);
  });
});
