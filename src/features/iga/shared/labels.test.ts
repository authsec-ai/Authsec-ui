import { describe, expect, it } from "vitest";

import { missingAccountLabel } from "./labels";

describe("missingAccountLabel (UI-055)", () => {
  it("says an ARN with an empty account field names none", () => {
    expect(missingAccountLabel("arn:aws:s3:::acme-iga-attachments")).toBe("No account in the ARN");
    expect(missingAccountLabel("arn:aws:s3:::acme/reports/q1.csv")).toBe("No account in the ARN");
    expect(missingAccountLabel("arn:aws:apigateway:us-east-1::/apis/*")).toBe("No account in the ARN");
  });
  it("keeps Unknown account for anything else", () => {
    expect(missingAccountLabel("*")).toBe("Unknown account");
    expect(missingAccountLabel("arn:aws:lambda:us-east-1:220171243705:function:x")).toBe("Unknown account");
  });
});
