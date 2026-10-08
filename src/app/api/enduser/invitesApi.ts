/**
 * END-USER INVITES API
 *
 * Endpoints for inviting end-users and directory sync
 * Authentication: Requires AuthMiddleware
 * Base Path: /uflow
 *
 * Available Endpoints:
 * - POST /uflow/invite - Invite an end-user
 * - POST /uflow/admin/ad/sync - Sync Active Directory for end-users
 *   (syncActiveDirectory / syncEntraID route to the admin-users variants
 *   when called with audience "admin")
 * - POST /uflow/admin/entra/sync - Sync Azure Entra ID for end-users
 * - POST /uflow/admin/admin-users/ad/sync - Sync Active Directory for admin users
 * - POST /uflow/admin/admin-users/entra/sync - Sync Azure Entra ID for admin users
 */

import { baseApi, withSessionData } from "../baseApi";

// ============================================================================
// TYPES
// ============================================================================

export interface InviteEndUser {
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  roles: string[];
  groups?: string[];
  workspace_domain?: string;
  workspace_id?: string;
  client_id?: string;
  project_id?: string;
}

export interface InviteResponse {
  success: boolean;
  message: string;
  user_id?: string;
}

export interface DirectorySync {
  provider: string;
  config_id?: string; // Use stored configuration
  config?: {
    server?: string;
    username?: string;
    password?: string;
    base_dn?: string;
    workspace_id?: string;
    client_id?: string;
    client_secret?: string;
    use_ssl?: boolean;
    skip_verify?: boolean;
  };
  dry_run?: boolean;
  audience?: "admin" | "endUser";
  sync_type?: string;
  workspace_id?: string;
  client_id?: string;
  project_id?: string;
}

export interface SyncResult {
  users_found?: number;
  users_created?: number;
  users_updated?: number;
  success?: boolean;
  message?: string;
}

// ============================================================================
// DIRECTORY SYNC ROUTING
// ============================================================================

/**
 * The backend has one sync route per (directory, audience), and the two
 * audiences bind different bodies (routes.go adminPlatform group):
 *
 *   end users:   POST /authsec/uflow/admin/{ad,entra}/sync
 *                { workspace_id, client_id, project_id, config_id | config, dry_run }
 *   admin users: POST /authsec/uflow/admin/admin-users/{ad,entra}/sync
 *                { workspace_id, sync_type: "ad" | "entra_id",
 *                  config_id | ad_config | entra_config, dry_run }
 */
export function directorySyncRequest(kind: "ad" | "entra", data: DirectorySync) {
  const dryRun = data.dry_run || false;
  const ids = {
    workspace_id: data.workspace_id,
    client_id: data.client_id,
    project_id: data.project_id,
  };
  if (data.audience === "admin") {
    return {
      url: `/authsec/uflow/admin/admin-users/${kind}/sync`,
      method: "POST",
      body: withSessionData({
        ...ids,
        sync_type: kind === "ad" ? "ad" : "entra_id",
        config_id: data.config_id,
        ...(kind === "ad" ? { ad_config: data.config } : { entra_config: data.config }),
        dry_run: dryRun,
      }),
    };
  }
  return {
    url: `/authsec/uflow/admin/${kind}/sync`,
    method: "POST",
    body: withSessionData({
      ...ids,
      config_id: data.config_id,
      config: data.config,
      dry_run: dryRun,
    }),
  };
}

// ============================================================================
// API
// ============================================================================

export const endUserInvitesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // POST /uflow/invite
    // Invite an end-user
    inviteEndUser: builder.mutation<InviteResponse, InviteEndUser>({
      query: (data) => ({
        url: "/authsec/uflow/admin/invite",
        method: "POST",
        body: withSessionData({
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          username: data.username,
          roles: data.roles,
          groups: data.groups || [],
          workspace_domain: data.workspace_domain,
          workspace_id: data.workspace_id,
          client_id: data.client_id,
          project_id: data.project_id,
        }),
      }),
      invalidatesTags: ["EndUser"],
    }),

    // Active Directory sync. End users (default): POST /uflow/admin/ad/sync;
    // audience "admin": POST /uflow/admin/admin-users/ad/sync (UI-016).
    syncActiveDirectory: builder.mutation<SyncResult, DirectorySync>({
      query: (data) => directorySyncRequest("ad", data),
      invalidatesTags: (_r, _e, data) =>
        data.audience === "admin" ? ["AdminUser", "SyncConfig"] : ["EndUser", "SyncConfig"],
    }),

    // Azure Entra ID sync. End users (default): POST /uflow/admin/entra/sync;
    // audience "admin": POST /uflow/admin/admin-users/entra/sync.
    syncEntraID: builder.mutation<SyncResult, DirectorySync>({
      query: (data) => directorySyncRequest("entra", data),
      invalidatesTags: (_r, _e, data) =>
        data.audience === "admin" ? ["AdminUser", "SyncConfig"] : ["EndUser", "SyncConfig"],
    }),

    // POST /uflow/admin/admin-users/ad/sync
    // Active Directory sync to Admin Users list
    syncAdminUsersActiveDirectory: builder.mutation<SyncResult, DirectorySync>({
      query: (data) => directorySyncRequest("ad", { ...data, audience: "admin" }),
      invalidatesTags: ["AdminUser", "SyncConfig"],
    }),

    // POST /uflow/admin/admin-users/entra/sync
    // Azure Entra ID sync to Admin Users list
    syncAdminUsersEntraID: builder.mutation<SyncResult, DirectorySync>({
      query: (data) => directorySyncRequest("entra", { ...data, audience: "admin" }),
      invalidatesTags: ["AdminUser", "SyncConfig"],
    }),
  }),
});

export const {
  useInviteEndUserMutation,
  useSyncActiveDirectoryMutation,
  useSyncEntraIDMutation,
  useSyncAdminUsersActiveDirectoryMutation,
  useSyncAdminUsersEntraIDMutation,
} = endUserInvitesApi;
