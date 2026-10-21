/**
 * Where each end user signs in from, and how they were added.
 *
 * The v2 end-user list (`/uflow/v2/tenants/:id/end-users`) carries no
 * identity-provider field, so this reads the user directory list
 * (`/uflow/admin/enduser/list`), which does (`provider`, `sync_source`,
 * `is_synced`), and indexes it by user id and email. Used by the End users
 * table (Identity provider column) and the Identity providers table (Users
 * count per provider).
 */

import { useMemo } from "react";

import { useGetEndUsersQuery } from "@/app/api/enduser/usersApi";

/** Largest page the directory list is asked for; one request covers the workspace. */
const DIRECTORY_PAGE = 500;

export interface SignInSource {
  /** Raw provider key from the directory, e.g. "google", "okta". Null for a local account. */
  provider: string | null;
  /** How the user was created when not by signing in: "SCIM" or "directory sync". */
  addedBy: "SCIM" | "directory sync" | null;
}

interface DirectoryUser {
  id?: string;
  user_id?: string;
  email?: string;
  provider?: string;
  sync_source?: string;
  is_synced?: boolean;
  is_synced_user?: boolean;
}

function directoryRows(response: unknown): DirectoryUser[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as DirectoryUser[];
  const r = response as { users?: unknown; data?: unknown };
  if (Array.isArray(r.users)) return r.users as DirectoryUser[];
  if (Array.isArray(r.data)) return r.data as DirectoryUser[];
  return [];
}

const SYNC_PROVIDERS: Record<string, { provider: string; addedBy: SignInSource["addedBy"] }> = {
  ad_sync: { provider: "active directory", addedBy: "directory sync" },
  ad: { provider: "active directory", addedBy: "directory sync" },
  entra: { provider: "entra", addedBy: "directory sync" },
  entra_id: { provider: "entra", addedBy: "directory sync" },
  azure_ad: { provider: "entra", addedBy: "directory sync" },
};

function sourceOf(u: DirectoryUser): SignInSource {
  const provider = u.provider?.trim().toLowerCase() || null;
  const sync = u.sync_source?.trim().toLowerCase() || null;
  if (sync === "scim" || provider === "scim") {
    return { provider: provider && provider !== "scim" ? provider : null, addedBy: "SCIM" };
  }
  const synced = (provider && SYNC_PROVIDERS[provider]) || (sync && SYNC_PROVIDERS[sync]);
  if (synced) return synced;
  if (!provider || provider === "local" || provider === "password" || provider === "email") {
    return { provider: null, addedBy: null };
  }
  return { provider, addedBy: null };
}

export function useSignInSources(workspaceId: string | null | undefined) {
  const { data, isLoading, isError } = useGetEndUsersQuery(
    { page: 1, limit: DIRECTORY_PAGE, workspace_id: workspaceId ?? undefined },
    { skip: !workspaceId },
  );

  return useMemo(() => {
    const byKey = new Map<string, SignInSource>();
    const users = directoryRows(data);
    users.forEach((u) => {
      const src = sourceOf(u);
      const id = u.user_id ?? u.id;
      if (id) byKey.set(id, src);
      if (u.email) byKey.set(u.email.toLowerCase(), src);
    });
    /** Number of directory users per provider key. */
    const countByProvider = new Map<string, number>();
    users.forEach((u) => {
      const p = sourceOf(u).provider;
      if (p) countByProvider.set(p, (countByProvider.get(p) ?? 0) + 1);
    });
    const lookup = (userId?: string | null, email?: string | null): SignInSource | undefined =>
      (userId ? byKey.get(userId) : undefined) ?? (email ? byKey.get(email.toLowerCase()) : undefined);
    return { lookup, countByProvider, isLoading, isError, loaded: !!data && !isError };
  }, [data, isLoading, isError]);
}

const KNOWN_NAMES: Array<[RegExp, string]> = [
  [/okta/, "Okta"],
  [/google|gsuite|workspace/, "Google Workspace"],
  [/microsoft|azure|entra/, "Microsoft Entra ID"],
  [/active directory|^ad$|ldap/, "Active Directory"],
  [/github/, "GitHub"],
  [/gitlab/, "GitLab"],
  [/auth0/, "Auth0"],
  [/onelogin/, "OneLogin"],
  [/ping/, "Ping Identity"],
  [/jumpcloud/, "JumpCloud"],
  [/keycloak/, "Keycloak"],
];

/**
 * The provider's display name: the connected identity provider's own name
 * when one matches, else a well-known vendor name, else the raw key.
 */
export function providerDisplayName(
  provider: string,
  connected: Array<{ provider_name: string; display_name: string }> = [],
): string {
  const key = provider.toLowerCase();
  const match = connected.find((p) => p.provider_name?.toLowerCase() === key);
  if (match?.display_name) return match.display_name;
  const known = KNOWN_NAMES.find(([re]) => re.test(key));
  if (known) return known[1];
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
