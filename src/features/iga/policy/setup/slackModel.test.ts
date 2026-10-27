import { describe, expect, it } from "vitest";

import { SLACK_UNAVAILABLE } from "./slackModel";

describe("SLACK_UNAVAILABLE", () => {
  it("names no server setting and ends each sentence once", () => {
    expect(SLACK_UNAVAILABLE).not.toMatch(/AUTHSEC_|Vault|client_id|client_secret/);
    expect(SLACK_UNAVAILABLE).not.toContain("..");
  });
});
