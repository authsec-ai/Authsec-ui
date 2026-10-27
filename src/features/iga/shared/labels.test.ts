import { describe, expect, it } from "vitest";

import { missingAccountLabel, patternRowsText } from "./labels";

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

describe("patternRowsText (UI-055)", () => {
  it("counts the patterns and says what they are", () => {
    expect(patternRowsText(1)).toBe("1 row is a pattern from policy statements, not a single resource; a pattern can reach many resources.");
    expect(patternRowsText(5)).toMatch(/^5 rows are patterns .* not single resources/);
  });
});
