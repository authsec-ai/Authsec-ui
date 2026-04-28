/**
 * TypeScript interfaces for the OAuth Scope Registry + MCP Tool Discovery system.
 * Maps to backend models in:
 *   - authsec/models/oauth_scope.go
 *   - authsec/models/mcp_tool.go
 *   - authsec/models/oauth_consent_grant.go
 */

// ── OAuth Scope ──

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface OAuthScope {
  id: string;
  tenant_id: string;
  resource_server_id?: string;
  scope_string: string;
  display_name: string;
  description?: string;
  icon?: string;
  risk_level: RiskLevel;
  parent_scope_id?: string;
  is_auto_discovered: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OAuthScopeResponse {
  id: string;
  scope_string: string;
  display_name: string;
  description?: string;
  icon?: string;
  risk_level: RiskLevel;
  is_auto_discovered: boolean;
}

export interface CreateOAuthScopeRequest {
  scope_string: string;
  display_name: string;
  description?: string;
  icon?: string;
  risk_level?: RiskLevel;
  parent_scope_id?: string;
  permission_ids?: string[];
}

export interface UpdateOAuthScopeRequest {
  display_name?: string;
  description?: string;
  icon?: string;
  risk_level?: RiskLevel;
  parent_scope_id?: string;
  permission_ids?: string[];
}

// ── MCP Tool ──

export type ScopeMapSource = "sdk_suggested" | "admin_override";

export type InventorySource = "mcp_scan" | "sdk_manifest" | "manual";

export interface ScopeMapEntry {
  scope_id: string;
  scope_string: string;
  display_name: string;
  risk_level: RiskLevel;
  auto_matched: boolean;
  /** "admin_override" mappings are runtime-effective; "sdk_suggested" is advisory only. */
  source?: ScopeMapSource;
}

export interface MCPToolResponse {
  id: string;
  name: string;
  title: string;
  description: string;
  input_schema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  scopes: ScopeMapEntry[];
  /** When true, the tool is callable by any token with audience=this RS, regardless of scope. */
  is_public?: boolean;
  /** Source of the tool itself: mcp_scan (auto), sdk_manifest (SDK-published), or manual (admin-typed). */
  inventory_source?: InventorySource;
  /** SDK-suggested scopes that haven't been promoted to admin_override yet (advisory). */
  suggested_scopes?: string[];
}

// ── Scope Matrix ──

export interface ScopeMatrixResourceServer {
  id: string;
  name: string;
  url: string;
  status?: string;
  last_scan_status?: string | null;
  scan_generation?: number;
  last_successful_generation?: number;
  last_scan_started_at?: string | null;
  last_scan_completed_at?: string | null;
}

export interface ScopeMatrixResponse {
  resource_server: ScopeMatrixResourceServer;
  tools: MCPToolResponse[];
  unmapped_scopes: OAuthScopeResponse[];
  total_scopes: number;
  total_tools: number;
}

// ── Tool-Scope Mapping ──

export interface ToolScopeMapping {
  tool_id: string;
  scope_id: string;
  remove?: boolean;
}

export interface UpdateToolScopeMapRequest {
  mappings: ToolScopeMapping[];
}

// ── Consent Grants ──

export interface OAuthConsentGrant {
  id: string;
  tenant_id: string;
  user_id: string;
  client_id: string;
  client_name?: string;
  resource_server_id: string;
  resource_name?: string;
  granted_scopes: string[];
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

export interface ConsentGrantsListResponse {
  consent_grants: OAuthConsentGrant[];
}
