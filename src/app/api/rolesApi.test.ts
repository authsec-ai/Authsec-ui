import { describe, expect, it } from "vitest";
import { sendRequests } from "../../test/apiRequest";
import { authSecRolesApi, roleDeleteErrorMessage } from "./rolesApi";

// UI-015: the backend has DELETE /authsec/uflow/admin/roles/:role_id only.
// Deleting several roles is a sequence of single deletes that stops at the
// first failure.

const ok = () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

describe("deleteUserDefinedRoles", () => {
  it("sends one DELETE per role, in order, with no body", async () => {
    const sent = await sendRequests(authSecRolesApi, "deleteUserDefinedRoles", {
      workspace_id: "ws",
      role_ids: ["r1", "r2"],
    });
    expect(sent).toEqual([
      { method: "DELETE", path: "/authsec/uflow/admin/roles/r1", body: undefined },
      { method: "DELETE", path: "/authsec/uflow/admin/roles/r2", body: undefined },
    ]);
  });

  it("stops at the first failure", async () => {
    const sent = await sendRequests(
      authSecRolesApi,
      "deleteUserDefinedRoles",
      { workspace_id: "ws", role_ids: ["r1", "r2", "r3"] },
      (req) =>
        req.url.endsWith("/r2")
          ? new Response(JSON.stringify({ error: "role is bound" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            })
          : ok(),
    );
    expect(sent.map((r) => r.path)).toEqual(["/authsec/uflow/admin/roles/r1", "/authsec/uflow/admin/roles/r2"]);
  });
});

describe("roleDeleteErrorMessage", () => {
  it("reports a partial delete", () => {
    expect(
      roleDeleteErrorMessage({ data: { error: "role is bound", deleted: ["r1"], failed: "r2", total: 3 } }),
    ).toBe("Deleted 1 of 3 roles, then stopped: role is bound");
  });

  it("passes a plain failure through", () => {
    expect(roleDeleteErrorMessage({ data: { error: "nope", deleted: [], failed: "r1", total: 1 } })).toBe("nope");
    expect(roleDeleteErrorMessage(undefined)).toBe("Failed to delete role");
  });
});
