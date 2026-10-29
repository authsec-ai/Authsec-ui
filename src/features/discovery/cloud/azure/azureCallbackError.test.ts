import { describe, expect, it } from "vitest";

import { callbackError } from "./azureCallbackError";

describe("callbackError", () => {
  it("words a known code", () => {
    expect(callbackError("consent_denied")).toMatch(/Admin consent was denied/);
  });
  it("never shows URL text as prose", () => {
    const spoof = "Your account is locked. Call 555-0100 to restore access";
    expect(callbackError(spoof)).not.toContain("555");
    expect(callbackError(spoof)).toBe("The sign-in did not complete. Try again from Connections.");
  });
  it("shows an unknown code that looks like one", () => {
    expect(callbackError("token_exchange_failed")).toContain("(code: token_exchange_failed)");
  });
});
