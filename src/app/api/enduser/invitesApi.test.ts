import { describe, expect, it } from "vitest";
import { sendRequest } from "../../../test/apiRequest";
import { directorySyncRequest, endUserInvitesApi } from "./invitesApi";

// UI-016: each (directory, audience) pair has its own backend route, and the
// admin-user routes bind ad_config / entra_config and a sync_type.

const AD = { server: "ldap.test", username: "u", password: "p", base_dn: "dc=test" };

describe("directory sync routing", () => {
  it("syncs end users through /admin/{ad,entra}/sync with config", () => {
    const ad = directorySyncRequest("ad", { provider: "ad", config: AD, dry_run: true });
    expect(ad.url).toBe("/authsec/uflow/admin/ad/sync");
    expect(ad.body).toMatchObject({ config: AD, dry_run: true });
    expect(ad.body).not.toHaveProperty("ad_config");

    const entra = directorySyncRequest("entra", { provider: "entra", config_id: "c1" });
    expect(entra.url).toBe("/authsec/uflow/admin/entra/sync");
    expect(entra.body).toMatchObject({ config_id: "c1", dry_run: false });
  });

  it("syncs admin users through /admin/admin-users/{ad,entra}/sync with the admin body", () => {
    const ad = directorySyncRequest("ad", { provider: "ad", config: AD, audience: "admin" });
    expect(ad.url).toBe("/authsec/uflow/admin/admin-users/ad/sync");
    expect(ad.body).toMatchObject({ sync_type: "ad", ad_config: AD });
    expect(ad.body).not.toHaveProperty("config");

    const entra = directorySyncRequest("entra", { provider: "entra", config_id: "c2", audience: "admin" });
    expect(entra.url).toBe("/authsec/uflow/admin/admin-users/entra/sync");
    expect(entra.body).toMatchObject({ sync_type: "entra_id", config_id: "c2" });
  });

  it("honours the audience passed to the generic mutations", async () => {
    const admin = await sendRequest(endUserInvitesApi, "syncActiveDirectory", {
      provider: "ad",
      config_id: "c3",
      audience: "admin",
    });
    expect(admin.path).toBe("/authsec/uflow/admin/admin-users/ad/sync");

    const endUser = await sendRequest(endUserInvitesApi, "syncEntraID", { provider: "entra", config_id: "c4" });
    expect(endUser.path).toBe("/authsec/uflow/admin/entra/sync");

    const pinned = await sendRequest(endUserInvitesApi, "syncAdminUsersEntraID", { provider: "entra", config_id: "c5" });
    expect(pinned.path).toBe("/authsec/uflow/admin/admin-users/entra/sync");
  });
});
