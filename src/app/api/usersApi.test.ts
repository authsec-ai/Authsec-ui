import { describe, expect, it } from "vitest";
import { sendRequest } from "../../test/apiRequest";
import { endUserUsersApi } from "./enduser/usersApi";
import { adminUsersApi } from "./admin/usersApi";

// UI-013: the Users page actions must hit routes the backend registers
// (routes.go: uflow/admin/enduser/active, uflow/user/admin/{reset,change}-password).

describe("users API routes", () => {
  it("activates an end user through the admin route", async () => {
    const req = await sendRequest(endUserUsersApi, "setUserActive", { user_id: "u1", active: false });
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/authsec/uflow/admin/enduser/active");
    expect(req.body).toMatchObject({ user_id: "u1", active: "false" });
  });

  it("resets and changes end-user passwords through the user/admin routes", async () => {
    const reset = await sendRequest(endUserUsersApi, "resetUserPassword", { email: "a@x.test" });
    expect(reset.method).toBe("POST");
    expect(reset.path).toBe("/authsec/uflow/user/admin/reset-password");
    expect(reset.body).toMatchObject({ email: "a@x.test", send_email: true });
    expect(reset.body).toHaveProperty("workspace_id");

    const change = await sendRequest(endUserUsersApi, "changeUserPassword", { email: "a@x.test", new_password: "pw-123456" });
    expect(change.path).toBe("/authsec/uflow/user/admin/change-password");
    expect(change.body).toMatchObject({ email: "a@x.test", new_password: "pw-123456" });
  });

  it("uses the same password routes for admin users", async () => {
    const reset = await sendRequest(adminUsersApi, "resetAdminUserPassword", { email: "b@x.test" });
    expect(reset.path).toBe("/authsec/uflow/user/admin/reset-password");
    const change = await sendRequest(adminUsersApi, "changeAdminUserPassword", { email: "b@x.test", new_password: "pw-123456" });
    expect(change.path).toBe("/authsec/uflow/user/admin/change-password");
  });

  it("toggles an admin user through admin/users/active", async () => {
    const req = await sendRequest(adminUsersApi, "setAdminUserActive", { user_id: "u2", active: true });
    expect(req.path).toBe("/authsec/uflow/admin/users/active");
  });
});
