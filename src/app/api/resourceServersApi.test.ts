import { describe, expect, it } from "vitest";
import { sendRequests } from "../../test/apiRequest";
import { resourceServersApi } from "./resourceServersApi";

// Intern report (Clients): a client created as "AI Agent" was listed as
// "Human app". The mutation rebuilt the body without client_kind, and the
// backend stores human_app when it is absent.

describe("preRegisterResourceServerClient", () => {
  it("sends the client kind and software id", async () => {
    const sent = await sendRequests(resourceServersApi, "preRegisterResourceServerClient", {
      id: "rs1",
      body: { client_name: "Test QA Client", redirect_uris: ["https://a/cb"], client_kind: "agent", software_id: "anthropic/claude" },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toBe("/authsec/applications/rs1/connections");
    expect(sent[0].body).toMatchObject({ client_kind: "agent", software_id: "anthropic/claude" });
  });

  it("leaves the kind to the backend when none is chosen", async () => {
    const sent = await sendRequests(resourceServersApi, "preRegisterResourceServerClient", {
      id: "rs1",
      body: { client_name: "c", redirect_uris: [] },
    });
    expect(sent[0].body).not.toHaveProperty("client_kind");
  });
});
