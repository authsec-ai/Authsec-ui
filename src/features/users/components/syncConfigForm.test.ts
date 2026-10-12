import { describe, expect, it } from "vitest";
import type { SyncConfig } from "@/app/api/syncConfigsApi";
import { AD_DEFAULTS, hydrateADForm, hydrateEntraForm, syncConfigTarget } from "./syncConfigForm";

// Intern report (Directory Sync): new forms skipped certificate checks and
// left LDAPS off; editing an Entra configuration filled "Tenant ID" with the
// AuthSec workspace id (and the AuthSec client id as the app id), so Test
// failed and Save overwrote the directory tenant.

const WORKSPACE = "5db1bbfc-d0db-4872-84de-309cb3195a4e";
const AUTHSEC_CLIENT = "094332e6-f820-474d-b0b5-3a8a737d1586";

describe("directory sync forms", () => {
  it("start new AD configurations secure", () => {
    expect(AD_DEFAULTS.use_ssl).toBe(true);
    expect(AD_DEFAULTS.skip_verify).toBe(false);
  });

  it("load an Entra configuration's own tenant and app, never the workspace's", () => {
    const stored = {
      id: "c1",
      sync_type: "entra_id",
      config_name: "Azure",
      workspace_id: WORKSPACE,
      client_id: AUTHSEC_CLIENT,
      entra_tenant_id: "contoso.onmicrosoft.com",
      entra_client_id: "app-1",
    } as SyncConfig;
    const form = hydrateEntraForm(stored);
    expect(form.workspace_id).toBe("contoso.onmicrosoft.com");
    expect(form.client_id).toBe("app-1");
    expect(form.client_secret).toBe("");
    expect(syncConfigTarget(stored)).toBe("contoso.onmicrosoft.com");
  });

  it("load an AD configuration's stored TLS settings and no secret", () => {
    const stored = {
      sync_type: "active_directory",
      config_name: "AD",
      ad_server: "dc.example.test:389",
      ad_username: "svc",
      ad_use_ssl: false,
      ad_skip_verify: false,
    } as SyncConfig & { ad_password: string };
    (stored as { ad_password?: string }).ad_password = "********";
    const form = hydrateADForm(stored);
    expect(form.server).toBe("dc.example.test:389");
    expect(form.use_ssl).toBe(false);
    expect(form.password).toBe("");
    expect(syncConfigTarget(stored)).toBe("dc.example.test:389");
  });
});
