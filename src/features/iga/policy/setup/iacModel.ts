/**
 * What the IaC mapping form and list say (SPEC-iga-phase3-policy.md §7.9, §8.11).
 * Pure checks that mirror the server's (services/iga_gov_iac_source_service.go
 * `reIaCRepo`, `reIaCBranch`, `cleanDirectory`; internal/iacpr/render.go
 * `ParseRoleMatch`), so a mistake is shown beside the field instead of as a
 * rejected request. The server still decides.
 */

import type { GovIaCFormat, GovIaCPermissions, GovIaCRoleRule } from "@/app/api/igaPolicySetupApi";

export const IAC_FORMATS: { value: GovIaCFormat; label: string; resource: string; example: string }[] = [
  { value: "terraform", label: "Terraform", resource: "resource address", example: "aws_iam_role.refund" },
  { value: "cloudformation", label: "CloudFormation", resource: "logical id", example: "RefundRole" },
];

export const iacFormatLabel = (f: string) => IAC_FORMATS.find((x) => x.value === f)?.label ?? f;

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;

export function repositoryProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "Required.";
  if (!REPO.test(v)) return "Use owner/name: letters, digits, _ . - only.";
  return null;
}

/** The directory as the server stores it (slashes trimmed); `null` when it would be refused. */
export function cleanDirectory(value: string): string | null {
  const d = value.trim().replace(/^\/+|\/+$/g, "");
  if (d.length > 500 || d.includes("\\")) return null;
  if (d === "") return "";
  for (const p of d.split("/")) if (p === "" || p === "." || p === "..") return null;
  return d;
}

export function directoryProblem(value: string): string | null {
  return cleanDirectory(value) === null ? "A path inside the repository, without .. or backslashes. Leave empty for the repository root." : null;
}

export function branchProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return BRANCH.test(v) && !v.includes("..") ? null : "Not a valid branch name.";
}

export interface RuleDraft {
  role_name: string;
  resource: string;
}

/** A rule row with both cells empty is not a rule. */
export const ruleIsBlank = (r: RuleDraft) => !r.role_name.trim() && !r.resource.trim();

export function ruleProblem(r: RuleDraft): string | null {
  if (ruleIsBlank(r)) return null;
  const name = r.role_name.trim();
  if (!name) return "Name the role.";
  if (!r.resource.trim()) return "Name the resource.";
  const stars = name.split("*").length - 1;
  if (stars > 1 || (stars === 1 && !name.endsWith("*"))) return "Only one trailing * is allowed in a role name.";
  return null;
}

export function cleanRules(rows: RuleDraft[]): GovIaCRoleRule[] {
  return rows.filter((r) => !ruleIsBlank(r)).map((r) => ({ role_name: r.role_name.trim(), resource: r.resource.trim() }));
}

/** §8.11's supported-forms matrix, as guidance. `supported` forms are changed mechanically; the rest fall back to Export. */
export interface IacFormRow {
  form: string;
  change: string;
  supported: boolean;
  /** The fallback reason code, for the rows that fall back to Export. */
  reason?: string;
}

export const IAC_FORMS: IacFormRow[] = [
  {
    form: "Terraform aws_iam_role in a mapped directory, found by its literal name or a role rule",
    change:
      "Sets permissions_boundary to a new aws_iam_policy added in the same directory, or edits that policy when AuthSec added it earlier.",
    supported: true,
  },
  {
    form: "Terraform customer boundary written as an aws_iam_policy with a literal jsonencode({...}) or heredoc document",
    change: "Narrows the document keeping its structure, or adds a separate copy for this role.",
    supported: true,
  },
  {
    form: "CloudFormation YAML or JSON AWS::IAM::Role with PermissionsBoundary (a literal ARN, or !Ref / !GetAtt to an AWS::IAM::ManagedPolicy in the same template)",
    change: "The same change, on the AWS::IAM::ManagedPolicy PolicyDocument.",
    supported: true,
  },
  {
    form: "A role or policy inside a remote or registry Terraform module; for_each or count with computed keys; documents from data aws_iam_policy_document",
    change: "None. The change is delivered by Export.",
    supported: false,
    reason: "iac_form_unsupported",
  },
  {
    form: "CDK, Pulumi, Terragrunt, SAM transforms, CloudFormation macros",
    change: "None. The change is delivered by Export.",
    supported: false,
    reason: "iac_generated_source",
  },
  {
    form: "A role that is not in the mapped source, or appears in more than one place",
    change: "None. The change is delivered by Export.",
    supported: false,
    reason: "iac_role_not_found or iac_role_ambiguous",
  },
];

export function permissionChip(p: GovIaCPermissions): { label: string; tone: "success" | "warning" } {
  if (p.state === "granted") return { label: "GitHub permissions granted", tone: "success" };
  if (p.state === "integration_missing") return { label: "No GitHub App installation", tone: "warning" };
  return { label: "Needs GitHub approval", tone: "warning" };
}
