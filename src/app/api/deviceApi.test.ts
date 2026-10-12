import { describe, expect, it } from "vitest";
import { sendRequest } from "../../test/apiRequest";
import { deviceApi } from "./deviceApi";

// UI-018: the backend deletes a workspace TOTP device with
// POST /authsec/uflow/auth/workspace/totp/devices/delete { device_id }.

describe("deviceApi", () => {
  it("deletes a TOTP device with the POST route and a device_id body", async () => {
    const req = await sendRequest(deviceApi, "deleteTOTPDevice", { token: "t", deviceId: "d1" });
    expect(req).toEqual({
      method: "POST",
      path: "/authsec/uflow/auth/workspace/totp/devices/delete",
      body: { device_id: "d1" },
    });
  });

  it("deletes a CIBA device with DELETE .../ciba/devices/:id", async () => {
    const req = await sendRequest(deviceApi, "deleteCIBADevice", { token: "t", deviceId: "d2" });
    expect(req).toMatchObject({ method: "DELETE", path: "/authsec/uflow/auth/workspace/ciba/devices/d2" });
  });
});
