import { SessionManager } from "./sessionManager";
import { getTenantFromUrl } from "./subdomainUtils";

/**
 * Get the current workspace ID
 * @returns The current workspace ID or null if no workspace is selected
 */
export function getWorkspaceId(): string | null {
  const session = SessionManager.getSession();
  if (session?.workspace_id) {
    return session.workspace_id;
  }

  if (session?.jwtPayload?.workspace_id) {
    return session.jwtPayload.workspace_id;
  }

  const slug = getTenantFromUrl();
  if (slug && isLikelyTenantId(slug)) {
    return slug;
  }

  return null;
}

/**
 * Get the current workspace
 * @returns The current workspace or null if no workspace is selected
 */
export function getCurrentWorkspace() {
  const session = SessionManager.getSession();
  const workspaceId = getWorkspaceId();
  if (!workspaceId) return null;
  
  return {
    id: workspaceId,
    name: `Workspace ${workspaceId}`,
    slug: workspaceId
  };
}

/**
 * Resolve the current workspace ID using session data or URL context
 */
export function resolveWorkspaceId(): string | null {
  return getWorkspaceId();
}

function isLikelyTenantId(value: string): boolean {
  // Accept canonical UUIDs only
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(value);
}
