/**
 * Display language for the AWS discovery inventory.
 *
 * Every map here is a TOTAL `Record<Enum, …>` rather than a lookup with a
 * fallback, for the reason AWSConnectorDrawer already documents against its
 * own coverage maps: a ternary chain there once ended in "Not configured", so
 * a state it did not name — `unknown` — rendered as a definite configuration
 * fact when the truth was that nobody had looked yet. A `Record` keyed on the
 * union makes the compiler refuse an unhandled case instead.
 *
 * The two exceptions are `resourceKindLabel` and `usageServiceLabel`, whose
 * inputs are free text server-side (a schema-wide enum of every AWS resource
 * type would need a migration for every service AWS ships), so both fall back
 * to the provider's own string rather than inventing a label.
 *
 * Terminology: `cloud_workload` rows are shown as **Compute** throughout, not
 * "Workloads". AGENTS.md reserves "Workload" for Kubernetes/SPIFFE pod
 * identities and forbids drifting the word; these rows are Lambda functions,
 * ECS task definitions, EC2 instances and Bedrock agents, which AWS's own
 * documentation calls compute. The field name stays `runtime_kind` in code.
 */

import type { StatusTone } from "@/components/ui/status-badge";
import type {
  AWSConnectorAttrs,
  CloudAssumeMechanism,
  CloudAssumeSubjectKind,
  CloudConnector,
  CloudConnectorStatus,
  CloudCoverageState,
  CloudIdentityKind,
  CloudPermissionEffect,
  CloudPermissionScopeKind,
  CloudRuntimeKind,
  CloudSensitivity,
  CloudUsage,
} from "@/app/api/cloudDiscoveryApi";

/* ─────────────────────────── identities ─────────────────────────────────── */

export const IDENTITY_KIND_LABEL: Record<CloudIdentityKind, string> = {
  iam_role: "IAM role",
  iam_user: "IAM user",
};

/* ──────────────────────────── compute ───────────────────────────────────── */

/** AWS's own names for each runtime, not AuthSec abstractions — an operator
 * reading "ECS task definition" knows exactly what to go and look at. */
export const RUNTIME_KIND_LABEL: Record<CloudRuntimeKind, string> = {
  lambda_function: "Lambda function",
  ecs_task_definition: "ECS task definition",
  ec2_instance: "EC2 instance",
  bedrock_agent: "Bedrock agent",
  bedrock_agentcore_runtime: "Bedrock AgentCore runtime",
};

/** Short form for a table cell where the row already carries the name. */
export const RUNTIME_KIND_SHORT: Record<CloudRuntimeKind, string> = {
  lambda_function: "Lambda",
  ecs_task_definition: "ECS task",
  ec2_instance: "EC2",
  bedrock_agent: "Bedrock agent",
  bedrock_agentcore_runtime: "AgentCore",
};

/** Ordered for a filter list: the two Bedrock kinds last, since they are the
 * rarest and the two most likely to be genuinely absent. */
export const RUNTIME_KINDS: CloudRuntimeKind[] = [
  "lambda_function",
  "ecs_task_definition",
  "ec2_instance",
  "bedrock_agent",
  "bedrock_agentcore_runtime",
];

/* ─────────────────────────── trust edges ────────────────────────────────── */

export const ASSUME_SUBJECT_LABEL: Record<CloudAssumeSubjectKind, string> = {
  cloud_service: "AWS service",
  identity: "IAM principal",
  k8s_service_account: "Kubernetes service account",
  ci_pipeline: "CI pipeline",
  external_account: "External AWS account",
};

/** `identity` and `external_account` both mean this role can be assumed from
 * outside AuthSec's own view, which the controller calls out as the finding —
 * so both get a tone that reads as "look at this", not as an error. */
export const ASSUME_SUBJECT_TONE: Record<CloudAssumeSubjectKind, StatusTone> = {
  cloud_service: "muted",
  identity: "info",
  k8s_service_account: "accent",
  ci_pipeline: "accent",
  external_account: "warning",
};

export const ASSUME_MECHANISM_LABEL: Record<CloudAssumeMechanism, string> = {
  sts_assume_role: "sts:AssumeRole",
  oidc_federation: "OIDC federation",
  eks_pod_identity: "EKS Pod Identity",
};

/* ───────────────────────── permissions ──────────────────────────────────── */

/** `account_wide` and `prefix` are the breadth of the grant, and both mean the
 * statement named no single resource. The label has to say that plainly, or a
 * reader assumes the resource column is broken. */
export const SCOPE_KIND_LABEL: Record<CloudPermissionScopeKind, string> = {
  resource: "One resource",
  prefix: "Resource prefix",
  account_wide: "Account-wide",
};

export const SCOPE_KIND_TONE: Record<CloudPermissionScopeKind, StatusTone> = {
  resource: "muted",
  prefix: "info",
  account_wide: "warning",
};

export const EFFECT_LABEL: Record<CloudPermissionEffect, string> = {
  allow: "Allow",
  deny: "Deny",
};

export const EFFECT_TONE: Record<CloudPermissionEffect, StatusTone> = {
  allow: "info",
  // A Deny is not a problem — it is a guardrail. Muted, never danger.
  deny: "muted",
};

export const SENSITIVITY_LABEL: Record<CloudSensitivity, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};

export const SENSITIVITY_TONE: Record<CloudSensitivity, StatusTone> = {
  low: "muted",
  med: "warning",
  high: "danger",
};

/* ───────────────────────── connector + coverage ─────────────────────────── */

export const CONNECTOR_STATUS_LABEL: Record<CloudConnectorStatus, string> = {
  active: "Active",
  error: "Error",
  revoked: "Revoked",
};

export const CONNECTOR_STATUS_TONE: Record<CloudConnectorStatus, StatusTone> = {
  active: "success",
  error: "danger",
  revoked: "muted",
};

/** Duplicated deliberately from AWSConnectorDrawer rather than exported from
 * it: the drawer owns the connection view, this file owns the inventory view,
 * and a shared import would couple two screens that are free to diverge. Both
 * are total over the same union, so neither can silently gain a hole. */
export const COVERAGE_STATE_LABEL: Record<CloudCoverageState, string> = {
  reached: "Reached",
  denied: "Denied",
  throttled: "Throttled",
  not_configured: "Not configured",
  unknown: "Not checked",
  constrained: "Blocked by policy",
  stale: "Stale",
};

/* ─────────────────────────── free-text kinds ────────────────────────────── */

const RESOURCE_KIND_LABEL: Record<string, string> = {
  s3_bucket: "S3 bucket",
  dynamodb_table: "DynamoDB table",
  secretsmanager_secret: "Secrets Manager secret",
  ssm_parameter: "SSM parameter",
  kms_key: "KMS key",
  sqs_queue: "SQS queue",
  sns_topic: "SNS topic",
  lambda_function: "Lambda function",
  iam_role: "IAM role",
  bedrock_model: "Bedrock model",
  bedrock_agent: "Bedrock agent",
};

/** Server-side this is free text, so an unknown kind renders as the provider's
 * own string. Never blank, never "Unknown". */
export function resourceKindLabel(kind: string): string {
  return RESOURCE_KIND_LABEL[kind] ?? kind;
}

const USAGE_SERVICE_LABEL: Record<string, string> = {
  s3: "Amazon S3",
  dynamodb: "DynamoDB",
  lambda: "Lambda",
  bedrock: "Amazon Bedrock",
  "bedrock-agentcore": "Bedrock AgentCore",
  secretsmanager: "Secrets Manager",
  kms: "KMS",
  ssm: "Systems Manager",
  sqs: "Amazon SQS",
  sns: "Amazon SNS",
  iam: "IAM",
  sts: "STS",
  ec2: "Amazon EC2",
  ecs: "Amazon ECS",
  eks: "Amazon EKS",
  logs: "CloudWatch Logs",
  cloudtrail: "CloudTrail",
  rds: "Amazon RDS",
  athena: "Athena",
  glue: "AWS Glue",
  sagemaker: "SageMaker",
};

export function usageServiceLabel(service: string): string {
  return USAGE_SERVICE_LABEL[service] ?? service;
}

export const USAGE_SOURCE_LABEL: Record<CloudUsage["source"], string> = {
  // The two support different claims: service-last-accessed is per service,
  // CloudTrail is per call. Say which one this row rests on.
  service_last_accessed: "IAM service last accessed",
  cloudtrail: "CloudTrail",
};

/* ──────────────────────── template versions ─────────────────────────────── */

/**
 * The CloudFormation template version that grants the compute reads.
 *
 * `internal/awsdiscovery.TemplateVersion` bumped 2026-09-01 → 2026-09-08 to add
 * a `WorkloadReads` statement (lambda:ListFunctions, ecs:ListTaskDefinitions,
 * ecs:DescribeTaskDefinition, ec2:DescribeInstances, iam:GetInstanceProfile).
 * That commit's own words: "This is the one change that requires existing
 * customers to redeploy their stack."
 *
 * Compared as a string because the values are ISO dates and sort
 * lexicographically. A connector reporting an older version cannot discover
 * compute at all — and because the workload scanner writes no coverage of its
 * own, that failure would otherwise surface as an empty list with no reason
 * attached, which is exactly the "unreached is not missing" inversion this
 * schema exists to prevent.
 *
 * Hard-coded rather than read from the API: `GET /aws/onboarding` returns the
 * CURRENT template version, but fetching it here would mint a fresh ExternalId
 * as a side effect (the endpoint mints one per call), which is precisely the
 * thing the onboarding wizard goes out of its way to avoid. A constant that
 * needs bumping alongside the backend is the cheaper mistake.
 */
export const TEMPLATE_VERSION_WITH_COMPUTE = "2026-09-08";

/** Whether this connector's deployed stack predates the compute permissions.
 * An absent version is NOT treated as stale: it means the connector was
 * recorded before the field was written, and guessing would raise a false
 * alarm on a stack that may be perfectly current. */
export function stackPredatesCompute(templateVersion: string | undefined): boolean {
  if (!templateVersion) return false;
  return templateVersion < TEMPLATE_VERSION_WITH_COMPUTE;
}

/* ───────────────────────────── accounts ────────────────────────────────── */

/** Sentinel for "no account filter".
 *
 * A sentinel rather than an empty string because SearchableSelect treats
 * undefined and "" as "nothing selected" and would render its placeholder
 * instead of highlighting the "All accounts" option. */
export const ALL_ACCOUNTS = "__all__";

/** How an AWS account reads in a list: the operator's display name where one
 * is set, else the account id — which is always the connector's real identity,
 * since the backend takes it from the assumed session rather than the request
 * body. */
export function accountLabel(connector: CloudConnector): string {
  const attrs = connector.attrs as AWSConnectorAttrs | undefined;
  const name = attrs?.display_name?.trim();
  return name ? `${name} · ${connector.scope_id}` : connector.scope_id;
}
