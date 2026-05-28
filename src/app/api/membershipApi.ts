/**
 * MEMBERSHIP API (Phase A — v2)
 *
 * Endpoints for the new tenant_memberships and tenant_end_user_states tables.
 * See backend: controllers/admin/membership_controller.go
 *              migrations/master/108_create_tenant_memberships.sql
 *              migrations/master/109_create_tenant_end_user_states.sql
 *
 * Base path: /uflow/v2
 *
 * Two distinct user kinds are exposed here (see User Taxonomy in
 * docs/USER_MANAGEMENT_AND_MCP_AUTHZ.md):
 *
 *   Members  — operators with operational rights inside the tenant.
 *              Managed under Settings → Team.
 *   EndUsers — consumers who have consented to the tenant's published
 *              Applications. Managed under the End Users workspace.
 */

import { baseApi } from "./baseApi";

// ============================================================================
// TYPES
// ============================================================================

export type MembershipStatus = "active" | "invited" | "suspended" | "left";
export type MembershipType =
  | "owner"
  | "admin"
  | "member"
  | "contractor"
  | "service_operator"
  | "readonly_auditor";

export interface TenantMembership {
  id: string;
  workspace_id: string;
  user_id: string;
  status: MembershipStatus;
  membership_type: MembershipType;
  source: string;
  external_id?: string | null;
  invited_by?: string | null;
  joined_at?: string | null;
  suspended_at?: string | null;
  created_at: string;
  updated_at: string;
  // Decorated by ListMembers/GetMembership JOIN
  user_email?: string;
  user_name?: string;
  user_username?: string;
  user_last_login?: string | null;
}

export type EndUserStatus = "active" | "suspended";

export interface TenantEndUserState {
  workspace_id: string;
  user_id: string;
  status: EndUserStatus;
  plan_tier?: string | null;
  rate_limit_override?: unknown;
  first_consent_at: string;
  last_seen_at?: string | null;
  suspended_at?: string | null;
  suspended_by?: string | null;
  suspended_reason?: string | null;
  created_at: string;
  updated_at: string;
  // Decorated by ListEndUsers/GetEndUser JOIN
  user_email?: string;
  user_name?: string;
  user_username?: string;
  user_last_login?: string | null;
  access_summary?: string;
  applications_count?: number;
  effective_scopes_count?: number;
  applications?: Array<{
    application_id: string;
    name: string;
    resource_uri: string;
    role_id: string;
    role_name: string;
    role_label: string;
    binding_id: string;
    scopes_count: number;
  }>;
}

export interface EffectiveBinding {
  binding_id: string;
  role_id: string;
  role_name: string;
  subject: "user" | "group" | "service_account";
  subject_id: string;
  scope_type?: string | null;
  scope_id?: string | null;
  expires_at?: string | null;
}

export interface ListResponse<T> {
  items: T[];
  count: number;
}

// ============================================================================
// API
// ============================================================================

export const membershipApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ─── Tenant memberships (operators) ───────────────────────────
    listMembers: build.query<
      ListResponse<TenantMembership>,
      { workspaceId: string; status?: MembershipStatus; type?: MembershipType }
    >({
      query: ({ workspaceId, status, type }) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (type) params.set("type", type);
        const qs = params.toString() ? `?${params.toString()}` : "";
        return { url: `authsec/uflow/v2/tenants/${workspaceId}/memberships${qs}` };
      },
      providesTags: (_, __, arg) => [
        { type: "TenantMembership", id: arg.workspaceId },
      ],
    }),

    createMembership: build.mutation<
      TenantMembership,
      {
        workspaceId: string;
        user_id: string;
        membership_type?: MembershipType;
        status?: MembershipStatus;
        source?: string;
        external_id?: string | null;
      }
    >({
      query: ({ workspaceId, ...body }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/memberships`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantMembership", id: arg.workspaceId },
      ],
    }),

    updateMembership: build.mutation<
      TenantMembership,
      {
        workspaceId: string;
        userId: string;
        status?: MembershipStatus;
        membership_type?: MembershipType;
        external_id?: string | null;
      }
    >({
      query: ({ workspaceId, userId, ...body }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/memberships/${userId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantMembership", id: arg.workspaceId },
      ],
    }),

    deleteMembership: build.mutation<
      void,
      { workspaceId: string; userId: string }
    >({
      query: ({ workspaceId, userId }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/memberships/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantMembership", id: arg.workspaceId },
      ],
    }),

    // ─── Tenant end-user states (consumers) ───────────────────────
    listEndUsers: build.query<
      ListResponse<TenantEndUserState>,
      {
        workspaceId: string;
        status?: EndUserStatus;
        plan_tier?: string;
        q?: string;
      }
    >({
      query: ({ workspaceId, status, plan_tier, q }) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (plan_tier) params.set("plan_tier", plan_tier);
        if (q) params.set("q", q);
        const qs = params.toString() ? `?${params.toString()}` : "";
        return { url: `authsec/uflow/v2/tenants/${workspaceId}/end-users${qs}` };
      },
      providesTags: (_, __, arg) => [
        { type: "TenantEndUserState", id: arg.workspaceId },
      ],
    }),

    getEndUser: build.query<
      TenantEndUserState,
      { workspaceId: string; userId: string }
    >({
      query: ({ workspaceId, userId }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/end-users/${userId}`,
      }),
      providesTags: (_, __, arg) => [
        { type: "TenantEndUserState", id: `${arg.workspaceId}:${arg.userId}` },
      ],
    }),

    updateEndUser: build.mutation<
      TenantEndUserState,
      {
        workspaceId: string;
        userId: string;
        status?: EndUserStatus;
        plan_tier?: string | null;
        rate_limit_override?: string | null;
      }
    >({
      query: ({ workspaceId, userId, ...body }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/end-users/${userId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantEndUserState", id: arg.workspaceId },
        { type: "TenantEndUserState", id: `${arg.workspaceId}:${arg.userId}` },
      ],
    }),

    suspendEndUser: build.mutation<
      TenantEndUserState,
      { workspaceId: string; userId: string; reason?: string }
    >({
      query: ({ workspaceId, userId, reason }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/end-users/${userId}/suspend`,
        method: "POST",
        body: { reason: reason ?? "" },
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantEndUserState", id: arg.workspaceId },
      ],
    }),

    reactivateEndUser: build.mutation<
      TenantEndUserState,
      { workspaceId: string; userId: string }
    >({
      query: ({ workspaceId, userId }) => ({
        url: `authsec/uflow/v2/tenants/${workspaceId}/end-users/${userId}/reactivate`,
        method: "POST",
      }),
      invalidatesTags: (_, __, arg) => [
        { type: "TenantEndUserState", id: arg.workspaceId },
      ],
    }),

    // ─── Group-subject role bindings ──────────────────────────────
    bindGroupToRole: build.mutation<
      unknown,
      {
        groupId: string;
        workspace_id: string;
        role_id: string;
        scope_type?: string;
        scope_id?: string;
        conditions?: Record<string, unknown>;
        expires_at?: string | null;
      }
    >({
      query: ({ groupId, ...body }) => ({
        url: `authsec/uflow/v2/groups/${groupId}/role-bindings`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["RoleBinding"],
    }),

    // ─── Effective access explorer ────────────────────────────────
    effectiveAccess: build.query<
      ListResponse<EffectiveBinding>,
      { userId: string }
    >({
      query: ({ userId }) => ({
        url: `authsec/uflow/v2/users/${userId}/effective-access`,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListMembersQuery,
  useCreateMembershipMutation,
  useUpdateMembershipMutation,
  useDeleteMembershipMutation,
  useListEndUsersQuery,
  useGetEndUserQuery,
  useUpdateEndUserMutation,
  useSuspendEndUserMutation,
  useReactivateEndUserMutation,
  useBindGroupToRoleMutation,
  useEffectiveAccessQuery,
} = membershipApi;
