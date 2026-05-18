import { describe, expect, it } from "vitest";

import {
  buildEnvSnippet,
  getEnvPairs,
  type EnvShell,
} from "./resource-server-utils";

const server = {
  id: "rs-test-123",
  resource_uri: "https://example.com/mcp",
  name: "demo server",
};

const secret = "sec_aebc33dd962d9d4ab542892f9349374a68007a2e95f9103fb518b3";

describe("getEnvPairs", () => {
  it("returns the canonical AuthSec block plus an upstream credential", () => {
    const pairs = getEnvPairs(server, secret);
    const keys = pairs.map((p) => p.key);
    expect(keys).toContain("AUTHSEC_RESOURCE_SERVER_ID");
    expect(keys).toContain("AUTHSEC_ISSUER");
    expect(keys).toContain("AUTHSEC_INTROSPECTION_CLIENT_SECRET");
    expect(keys).toContain("AUTHSEC_INTROSPECTION_SECRET");
    expect(keys).toContain("AUTHSEC_POLICY_MODE");
    expect(keys).toContain("AUTHSEC_PUBLISH_MANIFEST");
    expect(keys).toContain("UPSTREAM_API_TOKEN");
  });

  it("emits AUTHSEC_UPSTREAM_GITHUB_TOKEN for GitHub-named servers", () => {
    const pairs = getEnvPairs({ ...server, name: "github mcp" }, secret);
    const upstreamKeys = pairs
      .map((p) => p.key)
      .filter((k) => k.includes("UPSTREAM") || k.includes("GITHUB"));
    expect(upstreamKeys).toContain("AUTHSEC_UPSTREAM_GITHUB_TOKEN");
  });

  it("uses a placeholder when no secret has been issued", () => {
    const pairs = getEnvPairs(server, null);
    const secretPair = pairs.find((p) => p.key === "AUTHSEC_INTROSPECTION_CLIENT_SECRET");
    expect(secretPair?.value).toMatch(/<paste/);
  });
});

describe("buildEnvSnippet", () => {
  const cases: Array<[EnvShell, RegExp]> = [
    ["dotenv", /^AUTHSEC_RESOURCE_SERVER_ID=rs-test-123$/m],
    ["bash", /^export AUTHSEC_RESOURCE_SERVER_ID=rs-test-123$/m],
    ["pwsh", /^\$Env:AUTHSEC_RESOURCE_SERVER_ID = "rs-test-123"$/m],
    ["cmd", /^set AUTHSEC_RESOURCE_SERVER_ID=rs-test-123$/m],
  ];

  it.each(cases)("serializes %s with the expected line shape", (shell, regex) => {
    const out = buildEnvSnippet(server, secret, shell);
    expect(out).toMatch(regex);
  });

  it("emits a header that fits each shell's comment syntax", () => {
    expect(buildEnvSnippet(server, secret, "dotenv")).toMatch(/^# AuthSec/);
    expect(buildEnvSnippet(server, secret, "bash")).toMatch(/^# AuthSec/);
    expect(buildEnvSnippet(server, secret, "pwsh")).toMatch(/^# AuthSec/);
    expect(buildEnvSnippet(server, secret, "cmd")).toMatch(/^REM AuthSec/);
  });

  it("includes the upstream-credential comment in CMD-friendly REM form", () => {
    const out = buildEnvSnippet(server, secret, "cmd");
    expect(out).toMatch(/^REM Upstream service credential/m);
    expect(out).not.toMatch(/^# Upstream/m);
  });

  it("escapes embedded quotes in PowerShell values", () => {
    const out = buildEnvSnippet(
      { ...server, name: 'server "with" quotes' },
      secret,
      "pwsh",
    );
    expect(out).toMatch(/AUTHSEC_RESOURCE_NAME = "server `"with`" quotes"/);
  });

  it("quotes bash values containing whitespace", () => {
    const out = buildEnvSnippet(
      { ...server, name: "server with spaces" },
      secret,
      "bash",
    );
    expect(out).toMatch(/AUTHSEC_RESOURCE_NAME='server with spaces'/);
  });
});
