/** Where to send someone whose action a §7.12 code refused: the screen that fixes it. */

import type { PolicyFailure } from "./policyErrors";

const REMEDY_LINKS: Record<string, { label: string; to: string }> = {
  evidence_untrusted: { label: "Open Accounts", to: "/iga/connections" },
  resource_policy_evidence_incomplete: { label: "Open Accounts", to: "/iga/connections" },
  discovery_unavailable: { label: "Open Accounts", to: "/iga/connections" },
};

/**
 * The setup codes whose fix now lives on an AWS connection's detail page. With a
 * `connection_id` in the detail they deep-link to that connection's tab;
 * without one they fall back to the Connections list, where the account is
 * picked. (The setup used to be one workspace-wide page under Policy › AWS
 * access; it is per-connection now.)
 */
const SETUP_REMEDIES: Record<string, { label: string; tab: string }> = {
  enforcement_not_enabled: { label: "Open Settings", tab: "settings" },
  binding_not_verified: { label: "Open Enforcement setup", tab: "enforcement" },
  binding_partial: { label: "Open Enforcement setup", tab: "enforcement" },
  iac_source_missing: { label: "Open IaC sources", tab: "iac" },
  slack_user_not_linked: { label: "Open notification setup", tab: "notifications" },
};

/** The remedy link for a code, including a connection named in `detail.connection_id`. */
export function remedyFor(f: PolicyFailure): { label: string; to: string } | null {
  const conn = f.detail?.connection_id;
  const hasConn = typeof conn === "string" && !!conn;
  if (hasConn && ["evidence_untrusted", "resource_policy_evidence_incomplete", "discovery_unavailable"].includes(f.code)) {
    return { label: "Open the connection", to: `/iga/connections/${encodeURIComponent(conn)}/coverage` };
  }
  const setup = SETUP_REMEDIES[f.code];
  if (setup) {
    return hasConn
      ? { label: setup.label, to: `/iga/connections/${encodeURIComponent(conn)}/${setup.tab}` }
      : { label: "Open Accounts", to: "/iga/connections" };
  }
  const policy = f.detail?.policy_id;
  if (f.code === "role_controlled_by_policy" && typeof policy === "string" && policy) {
    return { label: "Edit that policy", to: `/iga/policy/${encodeURIComponent(policy)}` };
  }
  return REMEDY_LINKS[f.code] ?? null;
}
