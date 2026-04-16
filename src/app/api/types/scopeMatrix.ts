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

export interface ScopeMapEntry {
  scope_id: string;
  scope_string: string;
  display_name: string;
  risk_level: RiskLevel;
  auto_matched: boolean;
}

export interface MCPToolResponse {
  id: string;
  name: string;
  title: string;
  description: string;
  input_schema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  scopes: ScopeMapEntry[];
}

// ── Scope Matrix ──

export interface ScopeMatrixResourceServer {
  id: string;
  name: string;
  url: string;
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
