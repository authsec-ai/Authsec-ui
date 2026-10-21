/**
 * Pure helpers for the "Protect an MCP server" wizard:
 *   - parse the one URL the operator types into the backend's
 *     `public_base_url` + `protected_base_path` pair,
 *   - derive an editable default name from the URL host,
 *   - suggest one permission (scope) per discovered tool.
 *
 * Suggestions are only proposals. Nothing is enforced until the operator
 * continues past step 3, which writes them through `UpdateToolScopeMap`.
 */

import type {
  MCPToolResponse,
  OAuthScopeResponse,
  ScopeMapEntry,
} from "@/app/api/types/scopeMatrix";

/** Path the backend uses when a resource server has no protected path. */
export const DEFAULT_MCP_PATH = "/mcp";

export type ParsedServerUrl =
  | {
      ok: true;
      baseUrl: string;
      path: string;
      /** True when the URL had no path, so `DEFAULT_MCP_PATH` was used. */
      usedDefaultPath: boolean;
      resourceUri: string;
      host: string;
    }
  | { ok: false; error: string };

export function parseServerUrl(raw: string): ParsedServerUrl {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter the MCP server URL." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      error: "Enter a full URL that starts with https://, for example https://mcp.example.com/mcp.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "The URL must start with https:// or http://." };
  }
  if (url.search || url.hash) {
    return { ok: false, error: "Remove the ? query or # part. Use only the server address and path." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Remove the user name or password from the URL." };
  }
  const trimmedPath = url.pathname.replace(/\/+$/, "");
  const usedDefaultPath = trimmedPath === "";
  const path = usedDefaultPath ? DEFAULT_MCP_PATH : trimmedPath;
  return {
    ok: true,
    baseUrl: url.origin,
    path,
    usedDefaultPath,
    resourceUri: `${url.origin}${path}`,
    host: url.hostname,
  };
}

const GENERIC_HOST_LABELS = new Set(["www", "mcp", "api", "app", "server"]);

/**
 * Default display name from the URL host: `support-mcp.acme.dev` →
 * `support-mcp`; `mcp.github.com` → `github-mcp`. The operator can edit it.
 */
export function deriveServerName(host: string): string {
  if (!host) return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
  const labels = host.split(".").filter(Boolean);
  if (labels.length === 0) return host;
  if (labels[0] === "www") labels.shift();
  const first = labels[0] ?? host;
  if (GENERIC_HOST_LABELS.has(first) && labels.length > 2) {
    return `${labels[1]}-${first}`;
  }
  return first;
}

// ── Permission suggestions ─────────────────────────────────────────────────

export type AccessTier = "read" | "write" | "admin";

const READ_WORDS = ["read", "view", "list", "get", "search", "fetch", "find", "query", "describe", "show", "lookup", "browse", "inspect", "check", "count", "export"];
const WRITE_WORDS = ["write", "create", "update", "edit", "set", "add", "post", "put", "patch", "send", "close", "modify", "move", "rename", "upload", "run", "execute", "invoke", "submit", "assign", "reply", "comment", "merge", "open", "start", "stop", "trigger", "import", "save", "insert", "upsert"];
const ADMIN_WORDS = ["admin", "delete", "remove", "destroy", "drop", "purge", "wipe", "revoke", "manage", "grant", "reset", "truncate", "archive", "ban", "disable"];

function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Tier implied by a scope string's last segment (e.g. `support:write`). */
export function scopeTier(scope: Pick<OAuthScopeResponse, "scope_string">): AccessTier | null {
  const segments = scope.scope_string.toLowerCase().split(/[:./]/).filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (last === "*" || ADMIN_WORDS.includes(last)) return "admin";
  if (WRITE_WORDS.includes(last)) return "write";
  if (READ_WORDS.includes(last)) return "read";
  return null;
}

export type ToolTierGuess = { tier: AccessTier; reason: string };

/** Guess what a tool needs from MCP annotations first, then its name. */
export function guessToolTier(tool: MCPToolResponse): ToolTierGuess {
  const annotations = (tool.annotations ?? {}) as Record<string, unknown>;
  if (annotations.destructiveHint === true) {
    return { tier: "admin", reason: "The server marks this tool as destructive." };
  }
  if (annotations.readOnlyHint === true) {
    return { tier: "read", reason: "The server marks this tool as read-only." };
  }
  const nameWords = words(tool.name);
  const verb = nameWords.find(
    (w) => ADMIN_WORDS.includes(w) || WRITE_WORDS.includes(w) || READ_WORDS.includes(w),
  );
  if (verb && ADMIN_WORDS.includes(verb)) {
    return { tier: "admin", reason: `The name contains "${verb}".` };
  }
  if (verb && WRITE_WORDS.includes(verb)) {
    return { tier: "write", reason: `The name contains "${verb}".` };
  }
  if (verb && READ_WORDS.includes(verb)) {
    return { tier: "read", reason: `The name contains "${verb}".` };
  }
  return {
    tier: "write",
    reason: "No read-only signal found, so write access is suggested to be safe.",
  };
}

const RISK_RANK: Record<OAuthScopeResponse["risk_level"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Runtime-effective mappings only (sdk_suggested rows are advisory). */
export function assignedScopes(tool: MCPToolResponse): ScopeMapEntry[] {
  return tool.scopes.filter((scope) => scope.source === "admin_override");
}

/** Scope strings the MCP server / SDK suggested for this tool. */
export function serverSuggestedScopes(tool: MCPToolResponse): string[] {
  return Array.from(
    new Set([
      ...(tool.suggested_scopes ?? []),
      ...tool.scopes
        .filter((scope) => scope.source === "sdk_suggested")
        .map((scope) => scope.scope_string),
    ]),
  );
}

export type ToolSuggestion = {
  /** Registered scope id, or null when the tool should stay blocked. */
  scopeId: string | null;
  reason: string;
};

/**
 * One permission per tool. Order of preference:
 *   1. a scope the MCP server itself suggested (and that is registered),
 *   2. a registered scope whose tier matches the tool's guessed tier,
 *   3. for admin tools without an admin scope, the highest-risk scope —
 *      never a lower tier than the tool needs, so a delete tool doesn't
 *      silently become callable by read-only callers.
 */
export function suggestScopeForTool(
  tool: MCPToolResponse,
  scopes: OAuthScopeResponse[],
): ToolSuggestion {
  if (scopes.length === 0) {
    return { scopeId: null, reason: "This server has no permissions yet." };
  }
  const byString = new Map(scopes.map((scope) => [scope.scope_string, scope]));
  const fromServer = serverSuggestedScopes(tool)
    .map((value) => byString.get(value))
    .find(Boolean);
  if (fromServer) {
    return { scopeId: fromServer.id, reason: "Suggested by the MCP server." };
  }

  const guess = guessToolTier(tool);
  const tiered = scopes.filter((scope) => scopeTier(scope) === guess.tier);
  if (tiered.length > 0) {
    const pick = [...tiered].sort((a, b) => RISK_RANK[a.risk_level] - RISK_RANK[b.risk_level])[0];
    return { scopeId: pick.id, reason: guess.reason };
  }

  const fallbackTiers: AccessTier[] =
    guess.tier === "read" ? ["write", "admin"] : guess.tier === "write" ? ["admin"] : [];
  for (const tier of fallbackTiers) {
    const match = scopes.find((scope) => scopeTier(scope) === tier);
    if (match) {
      return { scopeId: match.id, reason: `${guess.reason} No ${guess.tier} permission exists, so a stricter one is suggested.` };
    }
  }
  const strictest = [...scopes].sort((a, b) => RISK_RANK[b.risk_level] - RISK_RANK[a.risk_level])[0];
  return {
    scopeId: strictest.id,
    reason: `${guess.reason} No ${guess.tier} permission exists, so the highest-risk one is suggested.`,
  };
}
