import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// UI-005: server.js serves /config.js to every visitor and logs what it
// serves. The HubSpot access token must not appear in it or in any log line.

describe("server.js public config", () => {
  it("does not read or expose the HubSpot access token", () => {
    const source = readFileSync(resolve(__dirname, "../../server.js"), "utf8");
    expect(source).not.toMatch(/HUBSPOT_ACCESS_TOKEN/);
  });
});
