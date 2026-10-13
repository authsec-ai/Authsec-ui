/** Where to send someone whose action a §7.12 code refused: the screen that fixes it. */

import type { PolicyFailure } from "./policyErrors";

const REMEDY_LINKS: Record<string, { label: string; to: string }> = {
  enforcement_not_enabled: { label: "Open Setup", to: "/iga/policy/setup/settings" },
  binding_not_verified: { label: "Open Enforcement setup", to: "/iga/policy/setup/enforcement" },
  binding_partial: { label: "Open Enforcement setup", to: "/iga/policy/setup/enforcement" },
  iac_source_missing: { label: "Open IaC sources", to: "/iga/policy/setup/iac" },
  evidence_untrusted: { label: "Open Connections", to: "/iga/connections" },
  resource_policy_evidence_incomplete: { label: "Open Connections", to: "/iga/connections" },
  discovery_unavailable: { label: "Open Connections", to: "/iga/connections" },
  slack_user_not_linked: { label: "Open notification setup", to: "/iga/policy/setup/notifications" },
};

/** The remedy link for a code, including a connection named in `detail.connection_id`. */
export function remedyFor(f: PolicyFailure): { label: string; to: string } | null {
  const conn = f.detail?.connection_id;
  if (typeof conn === "string" && conn && ["evidence_untrusted", "resource_policy_evidence_incomplete", "discovery_unavailable"].includes(f.code)) {
    return { label: "Open the connection", to: `/iga/connections/${encodeURIComponent(conn)}/coverage` };
  }
  const policy = f.detail?.policy_id;
  if (f.code === "role_controlled_by_policy" && typeof policy === "string" && policy) {
    return { label: "Edit that policy", to: `/iga/policy/${encodeURIComponent(policy)}` };
  }
  return REMEDY_LINKS[f.code] ?? null;
}
