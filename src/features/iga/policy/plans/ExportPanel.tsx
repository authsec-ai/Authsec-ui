/**
 * Export (J1, SPEC-iga-phase3-policy.md §7.3, §8.11): for each approved plan
 * the boundary document, the AWS CLI commands and the Terraform snippet, to
 * copy or download. AuthSec writes nothing to AWS for an export: the person
 * who applies it does, and AuthSec checks for the result at every scan.
 *
 * `GET .../export` answers 409 `version_not_approved` until the version has a
 * live approval; that is said as a state, not as a failure. A plan the server
 * delivers as an export although it asked for a pull request carries
 * `iac_fallback`, and the reason is shown with it.
 */

import { Download } from "lucide-react";
import { useState } from "react";

import {
  useGetGovVersionExportQuery,
  useLazyDownloadGovPlanArtifactQuery,
  type GovExportPlan,
} from "@/app/api/igaPolicyAuthoringApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";

import {
  PolicyActionError,
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  delivery,
  deploymentState,
  planKind,
  type PolicyFailure,
} from "../shared";
import { CodeBlock } from "./CodeBlock";
import { arnTail, prettyJson } from "./planCopy";
import { saveTextFile } from "./saveFile";

function PlanArtifact({ ws, policyId, versionNo, plan }: { ws: string; policyId: string; versionNo: number; plan: GovExportPlan }) {
  const [download, dl] = useLazyDownloadGovPlanArtifactQuery();
  const [failure, setFailure] = useState<PolicyFailure | null>(null);
  const a = plan.artifact;
  const documents = Object.entries(a.documents ?? {});
  const cli = (a.aws_cli ?? []).join("\n");
  const role = arnTail(a.role_arn) || a.role_id;

  const save = async () => {
    setFailure(null);
    try {
      const file = await download({ ws, policyId, versionNo, planId: plan.plan_id }).unwrap();
      saveTextFile(`authsec-${role}-${planKind(plan.kind).toLowerCase().replace(/\s+/g, "-")}-v${versionNo}.json`, JSON.stringify(file, null, 2));
    } catch (e) {
      setFailure(classifyPolicyError(e));
    }
  };

  return (
    <Panel
      title={`${role} · ${planKind(plan.kind)}`}
      actions={
        <>
          {plan.deployment_state ? <StateChip state={deploymentState(plan.deployment_state)} /> : null}
          <span className="text-xs text-(--color-text-muted)">{delivery(plan.delivery)}</span>
        </>
      }
      description={a.description?.effect}
    >
      <div className="space-y-3">
        {a.iac_fallback ? (
          <DecisionBanner
            tone="warning"
            title="Delivered as an export instead of a pull request"
            body={
              <>
                {a.iac_fallback.reason ? `${a.iac_fallback.reason}. ` : ""}
                {a.iac_fallback.detail}
              </>
            }
          />
        ) : null}
        {a.description?.recognition?.length ? (
          <p className="text-xs text-(--color-text-muted)">How AuthSec recognises this change afterwards: {a.description.recognition.join("; ")}.</p>
        ) : null}
        {documents.map(([name, text]) => (
          <CodeBlock key={name} title={`Document: ${name}`} text={prettyJson(text)} what={`document ${name}`} filename={name.endsWith(".json") ? name : `${name}.json`} />
        ))}
        {cli ? <CodeBlock title="AWS CLI commands" text={cli} what="AWS CLI commands" filename={`authsec-${role}-v${versionNo}.sh`} note="Run in order with credentials that can change this role's boundary." /> : null}
        {a.terraform ? <CodeBlock title="Terraform" text={a.terraform} what="Terraform" filename={`authsec-${role}-v${versionNo}.tf`} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void save()} disabled={dl.isFetching}>
            <Download className="size-3.5" aria-hidden="true" />
            {dl.isFetching ? "Preparing…" : "Download this plan's artifact"}
          </Button>
          <span className="text-xs text-(--color-text-muted)">One file: documents, commands and Terraform for this plan.</span>
        </div>
        <PolicyActionError failure={failure} />
      </div>
    </Panel>
  );
}

export function ExportPanel({ ws, policyId, versionNo }: { ws: string; policyId: string; versionNo: number }) {
  const q = useGetGovVersionExportQuery({ ws, policyId, versionNo }, { skip: !policyId || !versionNo });
  const failure = classifyPolicyError(q.error);

  if (q.isLoading) {
    return (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Loading the export…
      </p>
    );
  }
  if (failure?.code === "version_not_approved") {
    return (
      <DecisionBanner
        tone="info"
        title="Export is available once the version is approved"
        body="AuthSec prepares the documents and commands for the plans an approver has approved. Until then nothing can be applied outside AuthSec from this version."
      />
    );
  }
  if (failure) return <PolicyLoadFailure failure={failure} subject="the export" onRetry={() => void q.refetch()} />;

  const plans = q.data?.plans ?? [];
  if (plans.length === 0) {
    return (
      <p className="text-sm text-(--color-text-muted)">
        This version has no plan to export. A plan that is not eligible is left out.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-(--color-text-muted)">
        You apply an export yourself; AuthSec writes nothing to AWS for it and checks for the change at every scan. Apply the apply plan, and keep the undo plan for returning the role to its current state.
      </p>
      {plans.map((p) => (
        <PlanArtifact key={p.plan_id} ws={ws} policyId={policyId} versionNo={versionNo} plan={p} />
      ))}
    </div>
  );
}
