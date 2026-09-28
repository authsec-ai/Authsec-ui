/**
 * ITDR API client — threat detection, findings, response plans, escalation
 * leases (TRD 2, WP-A8, WP-U1b).
 */

import { apiClient } from "@/lib/apiClient";

const BASE = "/api/iga/v2/itdr";

// ── Detection rules ────────────────────────────────────────────────────

export interface DetectionRule {
  id: string;
  workspace_id: string;
  rule_key: string;
  name: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";

export async function listDetectionRules(): Promise<DetectionRule[]> {
  const res = await apiClient.get<{ rules: DetectionRule[] }>(`${BASE}/detection-rules`);
  return res.data.rules;
}

export async function getDetectionRule(ruleId: string): Promise<DetectionRule> {
  const res = await apiClient.get<DetectionRule>(`${BASE}/detection-rules/${ruleId}`);
  return res.data;
}

export async function createDetectionRule(input: Partial<DetectionRule>): Promise<DetectionRule> {
  const res = await apiClient.post<DetectionRule>(`${BASE}/detection-rules`, input);
  return res.data;
}

export async function updateDetectionRule(ruleId: string, input: Partial<DetectionRule>): Promise<DetectionRule> {
  const res = await apiClient.put<DetectionRule>(`${BASE}/detection-rules/${ruleId}`, input);
  return res.data;
}

// ── Findings ───────────────────────────────────────────────────────────

export type FindingStatus = "open" | "acknowledged" | "resolved" | "false_positive";
export type FindingOutcome = "attempted" | "prevented" | "successful" | "unknown";

export interface Finding {
  id: string;
  workspace_id: string;
  rule_id: string;
  rule_key: string;
  rule_name: string;
  rule_version: number;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  outcome: FindingOutcome;
  workload_id?: string;
  runtime_instance_id?: string;
  resource_id?: string;
  graph_revision: number;
  first_seen: string;
  last_seen: string;
  event_count: number;
  finding_window_seconds: number;
  recommended_response: string;
  identities?: { identity_account_id: string }[];
  policy_revisions?: { policy_revision_id: string }[];
  created_at: string;
  updated_at: string;
}

export async function listFindings(status?: FindingStatus): Promise<Finding[]> {
  const params = status ? `?status=${status}` : "";
  const res = await apiClient.get<{ findings: Finding[] }>(`${BASE}/findings${params}`);
  return res.data.findings;
}

export async function getFinding(findingId: string): Promise<Finding> {
  const res = await apiClient.get<Finding>(`${BASE}/findings/${findingId}`);
  return res.data;
}

export async function updateFindingStatus(
  findingId: string,
  status: FindingStatus,
  outcome?: FindingOutcome,
): Promise<Finding> {
  const res = await apiClient.put<Finding>(`${BASE}/findings/${findingId}/status`, {
    status,
    ...(outcome ? { outcome } : {}),
  });
  return res.data;
}

// ── Response plans ─────────────────────────────────────────────────────

export type ResponsePlanStatus = "requested" | "approved" | "executing" | "verified" | "failed" | "refused";

export interface ResponsePlan {
  id: string;
  workspace_id: string;
  finding_id: string;
  status: ResponsePlanStatus;
  targets: unknown[];
  actions: unknown[];
  shared_use_impact: string;
  expiry?: string;
  rollback_behavior: string;
  actor_id: string;
  approved_by?: string;
  approved_at?: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

export async function listResponsePlans(findingId: string): Promise<ResponsePlan[]> {
  const res = await apiClient.get<{ response_plans: ResponsePlan[] }>(
    `${BASE}/findings/${findingId}/response-plans`,
  );
  return res.data.response_plans;
}

export async function createResponsePlan(input: {
  finding_id: string;
  targets?: unknown[];
  actions?: unknown[];
  reason?: string;
}): Promise<ResponsePlan> {
  const res = await apiClient.post<ResponsePlan>(`${BASE}/response-plans`, input);
  return res.data;
}

export async function approveResponsePlan(planId: string): Promise<ResponsePlan> {
  const res = await apiClient.post<ResponsePlan>(`${BASE}/response-plans/${planId}/approve`);
  return res.data;
}

// ── Escalation leases ──────────────────────────────────────────────────

export type LeaseStatus = "pending" | "approved" | "redeemed" | "expired" | "denied";

export interface EscalationLease {
  id: string;
  workspace_id: string;
  workload_id?: string;
  client_identity_id: string;
  resource_id?: string;
  action: string;
  policy_revision_id?: string;
  approver_id?: string;
  audience: string;
  expiry: string;
  nonce: string;
  max_uses: number;
  uses_remaining: number;
  status: LeaseStatus;
  created_at: string;
  redeemed_at?: string;
}

export async function listEscalationLeases(status?: LeaseStatus): Promise<EscalationLease[]> {
  const params = status ? `?status=${status}` : "";
  const res = await apiClient.get<{ leases: EscalationLease[] }>(
    `${BASE}/escalation-leases${params}`,
  );
  return res.data.leases;
}

export async function createEscalationLease(input: {
  client_identity_id: string;
  action: string;
  expiry_minutes?: number;
  max_uses?: number;
}): Promise<EscalationLease> {
  const res = await apiClient.post<EscalationLease>(`${BASE}/escalation-leases`, input);
  return res.data;
}
