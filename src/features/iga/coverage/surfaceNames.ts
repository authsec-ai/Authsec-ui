/** Collection surfaces in readable words: the service and, where it has one, the region. */

const SERVICE: Record<string, string> = {
  iam_roles: "IAM roles",
  iam_users: "IAM users",
  iam_access_keys: "IAM access keys",
  iam_policies: "IAM policies",
  iam_groups: "IAM groups",
  policy_documents: "Policy documents",
  oidc_providers: "OIDC identity providers",
  eks_pod_identity: "EKS Pod Identity",
  activity: "Service activity (Access Advisor)",
  iam_credential_report: "IAM credential report",
  resource_policies: "Resource policies",
  organizations: "AWS Organizations",
  permission_scan: "Permission collection",
  workload_scan: "Workload collection",
  lambda: "Lambda functions",
  ecs: "ECS task definitions",
  compute: "Compute",
  "bedrock-agents": "Bedrock agents",
  "bedrock-agentcore": "Bedrock AgentCore runtimes",
  "agentcore-gateways": "AgentCore gateways",
  "agentcore-workload-identities": "AgentCore workload identities",
  "agentcore-credential-providers": "AgentCore credential providers",
  "cloudtrail-events": "CloudTrail events",
  "cloudtrail-status": "CloudTrail status",
};

/** "lambda:us-east-1" → service "Lambda functions", region "us-east-1"; IAM surfaces are global. */
export function readableSurface(surface: string): { service: string; region: string | null } {
  const i = surface.indexOf(":");
  const prefix = i < 0 ? surface : surface.slice(0, i);
  const rest = i < 0 ? null : surface.slice(i + 1);
  // "compute:lambda:us-east-1" nests one more level.
  if (prefix === "compute" && rest?.includes(":")) return readableSurface(rest);
  return { service: SERVICE[prefix] ?? prefix.replace(/[_-]/g, " "), region: rest };
}

