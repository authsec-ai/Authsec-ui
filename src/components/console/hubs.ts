/**
 * The AuthSec console's grouped pages: pages that answer the same question
 * are tabs of one page instead of separate sidebar rows. Every tab is still
 * its own route, so old links and bookmarks keep working.
 *
 * UX proposal: Users = end users, team and identity providers; Policies =
 * authentication rules, roles and scopes; Settings = the workspace as a
 * whole. A hub has no "What is this page?" line: the heading says it (the line
 * is shown on Home, MCP and Logs only).
 */

export interface HubTab {
  label: string;
  to: string;
  /** Other paths that belong to this tab (prefix match). */
  match?: string[];
  /** A second row of choices shown while this tab is open. */
  subTabs?: { label: string; to: string }[];
}

export interface HubDef {
  title: string;
  description: string;
  tabs: HubTab[];
}

export type HubId = "users" | "policies" | "settings";

export const HUBS: Record<HubId, HubDef> = {
  users: {
    title: "Users",
    description: "People who sign in to your agents and MCPs, and your team.",
    tabs: [
      { label: "End users", to: "/end-users" },
      { label: "Team", to: "/settings/team" },
      { label: "Identity providers", to: "/identity-providers" },
    ],
  },
  policies: {
    title: "Policies",
    description: "Rules for sign-in and for what each role can do.",
    tabs: [
      { label: "Authentication", to: "/policies/authentication" },
      { label: "Roles", to: "/access/roles", match: ["/access/assignments"] },
      { label: "Scopes", to: "/access/scopes" },
    ],
  },
  settings: {
    title: "Settings",
    description: "This workspace's details, domains, user provisioning and where its logs are sent.",
    tabs: [
      { label: "Workspace", to: "/settings" },
      { label: "Custom domains", to: "/custom-domains" },
      {
        label: "User provisioning",
        to: "/scim-connections",
        match: ["/directory-sync"],
        subTabs: [
          { label: "SCIM connections", to: "/scim-connections" },
          { label: "Directory sync", to: "/directory-sync" },
        ],
      },
      { label: "Trusted issuers", to: "/settings/trusted-issuers" },
      { label: "Log forwarding", to: "/logs/configure" },
    ],
  },
};
