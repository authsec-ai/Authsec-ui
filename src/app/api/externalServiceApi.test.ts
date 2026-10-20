import { describe, expect, it } from "vitest";
import { sendRequests } from "../../test/apiRequest";
import { externalServiceApi } from "./externalServiceApi";

// UI-014: creating or deleting an external service used to first call the
// nonexistent /uflow/admin/endusers/:ws/resources routes. Each action is now
// a single request to the exsvc route.

describe("external service API", () => {
  it("creates a service with one POST", async () => {
    const sent = await sendRequests(externalServiceApi, "createExternalService", {
      name: "svc",
      url: "https://svc.test",
      resource_id: 1,
      auth_type: "none",
      agent_accessible: false,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: "POST", path: "/authsec/exsvc/services" });
  });

  it("deletes a service with one DELETE", async () => {
    const sent = await sendRequests(externalServiceApi, "deleteExternalService", "s1");
    expect(sent).toEqual([{ method: "DELETE", path: "/authsec/exsvc/services/s1", body: undefined }]);
  });
});

describe("external service update", () => {
  it("uses PUT, the method the backend registers", async () => {
    const sent = await sendRequests(externalServiceApi, "updateExternalService", { id: "s1", body: { name: "n" } });
    expect(sent[0]).toMatchObject({ method: "PUT", path: "/authsec/exsvc/services/s1" });
  });
});
