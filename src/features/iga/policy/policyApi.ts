/**
 * Runtime policy admin API client (TRD 2, WP-U1b).
 * Wraps /api/iga/v2/runtime-policies for the policy admin console.
 */

import { apiClient } from "@/lib/apiClient";

const BASE = "/api/iga/v2/runtime-policies";

export type PolicyLifecycle =
  | "draft"
  | "validated"
  | "simulated"
  | "approved"
  | "published"
  | "superseded"
  | "revoked";

export interface RuntimePolicy {
  id: string;
  workspace_id: string;
  name: string;
  owner_user_id: string;
  current_draft_revision: number;
  lifecycle: PolicyLifecycle;
  created_at: string;
  updated_at: string;
}

export interface PolicyRevision {
  id: string;
  workspace_id: string;
  policy_id: string;
  revision: number;
  document: unknown;
  content_hash: string;
  author_user_id: string;
  state: PolicyLifecycle;
  graph_revision: number;
  compiler_format: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyWithRevisions extends RuntimePolicy {
  revisions?: PolicyRevision[];
}

export async function listPolicies(): Promise<RuntimePolicy[]> {
  const res = await apiClient.get<{ policies: RuntimePolicy[] }>(BASE);
  return res.data.policies;
}

export async function getPolicy(id: string): Promise<PolicyWithRevisions> {
  const res = await apiClient.get<PolicyWithRevisions>(`${BASE}/${id}`);
  return res.data;
}

export async function createPolicy(input: {
  name: string;
  document: unknown;
}): Promise<RuntimePolicy> {
  const res = await apiClient.post<RuntimePolicy>(BASE, input);
  return res.data;
}

export async function putDraft(
  id: string,
  document: unknown,
): Promise<PolicyRevision> {
  const res = await apiClient.put<PolicyRevision>(`${BASE}/${id}/draft`, {
    document,
  });
  return res.data;
}

export async function validatePolicy(id: string): Promise<PolicyRevision> {
  const res = await apiClient.post<PolicyRevision>(`${BASE}/${id}/validate`);
  return res.data;
}

export async function simulatePolicy(id: string): Promise<{ simulation_id: string }> {
  const res = await apiClient.post<{ simulation_id: string }>(`${BASE}/${id}/simulations`);
  return res.data;
}

export async function approvePolicy(id: string): Promise<PolicyRevision> {
  const res = await apiClient.post<PolicyRevision>(`${BASE}/${id}/approvals`);
  return res.data;
}

export async function publishPolicy(
  id: string,
  mode: "observe" | "enforce" = "observe",
): Promise<PolicyRevision> {
  const res = await apiClient.post<PolicyRevision>(`${BASE}/${id}/publications`, { mode });
  return res.data;
}

export async function revokePolicy(id: string): Promise<PolicyRevision> {
  const res = await apiClient.post<PolicyRevision>(`${BASE}/${id}/revoke`);
  return res.data;
}

export async function getRollout(id: string): Promise<unknown> {
  const res = await apiClient.get(`${BASE}/${id}/rollouts`);
  return res.data;
}
