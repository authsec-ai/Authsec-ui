/**
 * Shared, read-only signals for one MCP (an `Application` in code), used by
 * the MCP list rows and the MCP page header / Overview. Every value comes
 * from an existing endpoint; nothing here is invented.
 *
 *   • Status — `isLaunched` (backend `state === "ready"` + `setup_completed_at`):
 *     "Enforcing" once AuthSec checks a token before each tool runs,
 *     otherwise "Needs setup".
 *   • Identity provider — the MCP's IdP policy rows
 *     (`GET /applications/:id/identity-providers`) resolved to names via the
 *     workspace IdP list. The policy is an optional allow-list, so no rows
 *     means any workspace provider can sign people in.
 *   • Agents — approved connections (`GET /applications/:id/connections`)
 *     that aren't machine credentials.
 */

import { useMemo } from "react";

import {
  useListApplicationIDPPoliciesQuery,
  useListIdentityProvidersQuery,
} from "@/app/api/authMethodApi";
import type { AgentConnection } from "@/app/api/agentIdentityApi";
import type { Application } from "../types";
import { isLaunched } from "./computeReadiness";

export type McpStatus = { enforcing: boolean; label: "Enforcing" | "Needs setup" };

export function mcpStatus(
  application: Pick<Application, "state" | "setup_completed_at">,
): McpStatus {
  const enforcing = isLaunched(application);
  return { enforcing, label: enforcing ? "Enforcing" : "Needs setup" };
}

/** "Enforcing" (green) / "Needs setup" (red) pill. Renders inside `[data-cr]`. */
export function mcpStatusBadgeClass(status: McpStatus): string {
  return status.enforcing ? "badge badge--success" : "badge badge--danger";
}

/**
 * The MCP's sign-in provider(s) as one short label, or undefined while
 * loading / when the endpoint can't answer.
 */
export function useMcpIdentityProviderLabel(applicationId: string | undefined): {
  label?: string;
  title?: string;
} {
  const { data: policies, isError: policiesError } = useListApplicationIDPPoliciesQuery(
    applicationId ?? "",
    { skip: !applicationId },
  );
  const { data: providers } = useListIdentityProvidersQuery();

  return useMemo(() => {
    if (policiesError || !policies) return {};
    const enabled = policies.filter((p) => p.enabled);
    if (enabled.length === 0) {
      if (!providers) return {};
      return providers.length === 0
        ? { label: "—", title: "No identity provider is configured in this workspace." }
        : {
            label: "Any workspace provider",
            title: "This MCP doesn't restrict sign-in to particular identity providers.",
          };
    }
    const byId = new Map((providers ?? []).map((p) => [p.id, p.display_name]));
    const names = enabled.map((p) => byId.get(p.identity_provider_id) ?? "Identity provider");
    const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    return { label, title: names.join(", ") };
  }, [policies, policiesError, providers]);
}

/** An approved connection made by an agent (not a machine credential). */
export function isAgentConnection(c: AgentConnection): boolean {
  return (
    c.status === "approved" &&
    c.access_method !== "m2m" &&
    c.authority?.type !== "service_account"
  );
}

const CLIENT_KIND_LABEL: Record<string, string> = {
  agent: "AI agent",
  cli: "CLI agent",
  human_app: "App",
};

export function agentTypeLabel(c: AgentConnection): string {
  if (c.client_kind && CLIENT_KIND_LABEL[c.client_kind]) return CLIENT_KIND_LABEL[c.client_kind];
  return "AI agent";
}

export type ToolLevel = "read" | "write" | "admin";

/**
 * Read / Write / Admin for one tool, from the scope strings that actually
 * gate it (same verb heuristics the Tools page uses to explain risk).
 * Undefined when the tool has no runtime-effective scope.
 */
export function toolLevel(scopeStrings: string[]): ToolLevel | undefined {
  if (scopeStrings.length === 0) return undefined;
  let level: ToolLevel = "read";
  for (const raw of scopeStrings) {
    const value = raw.toLowerCase();
    if (value.includes("admin") || value.includes("delete") || value.includes(":*")) {
      return "admin";
    }
    if (/(^|[:_/-])(write|create|update)([:_/-]|$)/.test(value)) level = "write";
  }
  return level;
}
