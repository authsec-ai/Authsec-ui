import { describe, expect, it } from "vitest";
import { domainNameError, verifyFailureMessage } from "./domainValidation";

// Intern report (Custom Domains): "bad domain!!" enabled Add Domain, and a
// failed check said only "verification failed".
describe("domainNameError", () => {
  it("accepts host names", () => {
    for (const ok of ["auth.example.com", "Login.Example.com.", "my-app.example.co.uk", "mylocalhost.com"]) {
      expect(domainNameError(ok), ok).toBeNull();
    }
  });
  it("rejects what the server rejects", () => {
    for (const bad of ["", "bad domain!!", "example", "-a.example.com", "a..example.com", "10.0.0.1", "a.123", "auth.example.com:8443", "foo.localhost", "*.example.com"]) {
      expect(domainNameError(bad), bad).not.toBeNull();
    }
  });
});

describe("verifyFailureMessage", () => {
  it("shows the server's reason", () => {
    expect(verifyFailureMessage({ data: { error: "No TXT record found at _authsec-challenge.x.com." } })).toContain("No TXT record");
    expect(verifyFailureMessage({ data: { error: "verification failed", details: "verification failed: TXT record value mismatch" } })).toContain("mismatch");
  });
});
