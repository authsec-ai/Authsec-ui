/**
 * Static, client-side provider metadata that the backend catalog doesn't
 * carry: a display color/initial for the badge, and which providers have a
 * typed action registered today (Slack, GitHub) vs. catalog-only entries
 * that can be connected but have nothing to execute yet (Google, HubSpot,
 * Notion, Jira). Keep this in sync with
 * authsec/migrations/deltas/connector_p2_p3_forward.sql when new adapters
 * ship — there is no `action_count` field on ConnectorProvider to derive
 * this from.
 */

export interface KnownAction {
  action_key: string;
  display_name: string;
  /** Field names only — informational, not a live JSON Schema render. */
  inputs: string[];
}

export interface ProviderMeta {
  initial: string;
  colorClass: string;
  actions: KnownAction[];
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  slack: {
    initial: "S",
    colorClass: "bg-[#4a154b] text-white",
    actions: [
      { action_key: "postMessage", display_name: "Post a Slack message", inputs: ["channel", "text"] },
    ],
  },
  github: {
    initial: "GH",
    colorClass: "bg-[#24292f] text-white",
    actions: [
      { action_key: "createIssue", display_name: "Create a GitHub issue", inputs: ["owner", "repo", "title", "body"] },
      { action_key: "listCommits", display_name: "List recent commits", inputs: ["owner", "repo", "per_page"] },
    ],
  },
  google: {
    initial: "G",
    colorClass: "bg-white text-[#1a73e8] border border-border",
    actions: [],
  },
  hubspot: {
    initial: "H",
    colorClass: "bg-[#ff7a59] text-white",
    actions: [],
  },
  notion: {
    initial: "N",
    colorClass: "bg-[#111111] text-white",
    actions: [],
  },
  jira: {
    initial: "J",
    colorClass: "bg-[#0052cc] text-white",
    actions: [],
  },
};

export function providerMeta(providerKey: string): ProviderMeta {
  return (
    PROVIDER_META[providerKey] ?? {
      initial: providerKey.slice(0, 1).toUpperCase(),
      colorClass: "bg-muted text-muted-foreground border border-border",
      actions: [],
    }
  );
}

/** Reads the current workspace id out of the session, same convention used
 * by LogsConfigurationPage.tsx and AddDomainModal.tsx. No shared hook exists
 * for this yet. */
export function getWorkspaceId(): string {
  try {
    const session = JSON.parse(localStorage.getItem("authsec_session_v2") || "{}");
    return session?.workspace_id || "";
  } catch {
    return "";
  }
}
