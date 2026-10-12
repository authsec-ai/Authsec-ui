/**
 * Policy › Deployments › one deployment (SPEC-iga-phase3-policy.md §9.3 S5
 * "Deployments", §9.7 states and copy): what happened to one role, what is and
 * is not proven, and the one next step.
 *
 * Reads `GET /deployments/:id` (services.GovDeploymentDetail). It carries
 * neither the policy, the version number nor the role, so those come from the
 * list row (`useDeploymentRow`). There is no pull-request / IaC change object:
 * for awaiting_merge / awaiting_apply the page shows the state, the deadline
 * and the apply-progress evidence and says a link is not available.
 *
 * Boundary verification, application health, unexpected denials and the
 * observed restriction are four lines with their own evidence; the boundary
 * being verified proves the boundary state only.
 */

import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

import {
  canUndo,
  useGetGovDeploymentQuery,
  type GovApplyProgress,
  type GovDeploymentState,
} from "@/app/api/igaPolicyDeploymentsApi";
import { DecisionBanner, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, StateChip, classifyPolicyError, delivery, deploymentState, planKind, roleNameOf, shortHash, usePolicyPermission } from "../shared";
import { policyHref } from "../policies/policyModel";
import { useMemberNames } from "../policies/useMemberNames";
import {
  AcceptancesPanel,
  AttemptsPanel,
  DeliveryPanel,
  HealthReportsPanel,
  LedgerPanel,
  MigrationsPanel,
  RevalidationsPanel,
  ServiceOutcomesPanel,
  ValidationsPanel,
  VerificationPanel,
} from "./DeploymentSections";
import { ExportPanel } from "../plans/ExportPanel";
import { OutcomePanel, StuckApplyingPanel } from "./OutcomePanel";
import { HealthReportDialog } from "./HealthReportDialog";
import { UndoDialog } from "./UndoDialog";
import { ValidationDialog } from "./ValidationDialog";
import { isLiveState, nextActionSentence, roleLabel, unknownAttemptAt, verificationLines } from "./deploymentModel";
import { useDeploymentRow } from "./useDeploymentRow";

const TONE: Partial<Record<GovDeploymentState, ConsoleTone>> = {
  blocked: "danger",
  failed: "danger",
  outcome_unresolved: "danger",
  outcome_unknown: "warning",
  drifted: "warning",
  verified: "success",
};

export default function DeploymentDetailPage() {
  const ws = getWorkspaceId() ?? "";
  const { id = "" } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const policyHint = search.get("policy");

  const [live, setLive] = useState(false);
  const query = useGetGovDeploymentQuery({ ws, id }, { skip: !id, pollingInterval: live ? 15_000 : 0, skipPollingIfUnfocused: true });
  const detail = query.data;
  useEffect(() => setLive(isLiveState(detail?.deployment.state)), [detail?.deployment.state]);

  const ctx = useDeploymentRow(ws, id, policyHint);
  const nameOf = useMemberNames(ws);
  const enforce = usePolicyPermission("governance:enforce");
  const author = usePolicyPermission("governance:author");
  const [undoOpen, setUndoOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [report, setReport] = useState<"problem" | "working" | null>(null);

  const failure = classifyPolicyError(query.error);

  if (failure && !detail) {
    return (
      <PolicyShell title="Deployment">
        <PolicyLoadFailure failure={failure} subject="this deployment" onRetry={() => void query.refetch()} />
        <Link to="/iga/policy/deployments" className="text-sm font-medium text-(--color-primary-text) hover:underline">
          Back to Deployments
        </Link>
      </PolicyShell>
    );
  }
  if (!detail) {
    return (
      <PolicyShell title="Deployment">
        <p role="status" className="text-sm text-(--color-text-muted)">
          Loading the deployment…
        </p>
      </PolicyShell>
    );
  }

  const d = detail.deployment;
  const row = ctx.row;
  const pre = detail.plan.precondition as { role_arn?: unknown } | undefined;
  const arn = row?.role_arn || (typeof pre?.role_arn === "string" ? pre.role_arn : "");
  const role = roleLabel(arn, row?.role_id);
  const policyId = row?.policy_id ?? policyHint ?? undefined;
  const state = deploymentState(d.state);
  const lines = verificationLines(detail);
  const artifactEv = detail.verifications.find((v) => v.dimension === "artifact");
  const progress: GovApplyProgress | undefined =
    artifactEv?.dimension === "artifact" && "summary" in artifactEv.evidence && "visible" in artifactEv.evidence ? (artifactEv.evidence as GovApplyProgress) : undefined;
  const sentence = nextActionSentence(d, { unknownAt: unknownAttemptAt(detail.attempts) });
  const undoable = !!row && enforce.offered && canUndo(row, ctx.siblings);
  const unknownOpen = d.state === "outcome_unknown" || d.state === "outcome_unresolved";
  const moves = detail.migrations.length > 0 || d.kind === "split" || d.kind === "split_revert";

  return (
    <PolicyShell
      title={`${planKind(d.kind)} · ${role}`}
      description={row ? `Policy version ${row.version_no} · account ${row.account_id}` : "What happened to this role, and what is proven."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {undoable ? (
            <Button variant="outline" onClick={() => setUndoOpen(true)}>
              Undo…
            </Button>
          ) : null}
          {author.offered ? (
            <Button variant="outline" onClick={() => setTestOpen(true)}>
              Declare a test call
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setReport("problem")}>
            Report on this change
          </Button>
        </div>
      }
    >
      <Link to="/iga/policy/deployments" className="text-xs font-medium text-(--color-primary-text) hover:underline">
        All deployments
      </Link>

      {failure ? (
        <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
          <strong className="font-medium">Could not refresh.</strong> It shows what loaded earlier.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <DecisionBanner tone={TONE[d.state] ?? "info"} title={state.label} body={sentence || state.hint || ""} />

      <Panel title="Summary">
        <Facts>
          <Fact label="State">
            <StateChip state={state} />
          </Fact>
          <Fact label="Role">{role}</Fact>
          {policyId ? (
            <Fact label="Policy">
              <Link to={policyHref(policyId, "deployments")} className="text-(--color-primary-text) hover:underline">
                Open the policy{row ? `, version ${row.version_no}` : ""}
              </Link>
            </Fact>
          ) : null}
          <Fact label="Kind">{planKind(d.kind)}</Fact>
          <Fact label="Delivery">{delivery(d.delivery)}</Fact>
          <Fact label="Attempts">{d.attempts}</Fact>
          <Fact label="Created">
            <Timestamp iso={d.created_at} />
          </Fact>
          {d.applied_at ? (
            <Fact label="Applied">
              <Timestamp iso={d.applied_at} />
            </Fact>
          ) : null}
          {d.verified_at ? (
            <Fact label="Verified">
              <Timestamp iso={d.verified_at} />
            </Fact>
          ) : null}
          {d.verify_deadline_at && !d.verified_at ? (
            <Fact label="Verification due">
              <Timestamp iso={d.verify_deadline_at} />
            </Fact>
          ) : null}
          {d.emergency_by ? <Fact label="Emergency">By {nameOf(d.emergency_by)}: {d.emergency_reason}</Fact> : null}
          {d.state_reason && !["policy_paused", "delivery_not_available", "binding_unavailable"].includes(d.state_reason) ? <Fact label="Reason">{d.state_reason}</Fact> : null}
          {d.recovers_deployment_id ? (
            <Fact label="Took over from">
              <Link to={`/iga/policy/deployments/${encodeURIComponent(d.recovers_deployment_id)}${policyId ? `?policy=${encodeURIComponent(policyId)}` : ""}`} className="text-(--color-primary-text) hover:underline">
                The deployment whose outcome was unresolved
              </Link>
            </Fact>
          ) : null}
          {d.recovered_by_deployment_id ? (
            <Fact label="Taken over by">
              <Link to={`/iga/policy/deployments/${encodeURIComponent(d.recovered_by_deployment_id)}${policyId ? `?policy=${encodeURIComponent(policyId)}` : ""}`} className="text-(--color-primary-text) hover:underline">
                The later deployment
              </Link>
            </Fact>
          ) : null}
        </Facts>
        {!row && !ctx.loading ? (
          <p className="mt-2 text-xs text-(--color-text-muted)">
            This deployment was not found in the deployments list, so its policy is not shown and Undo is not offered here. Open it from its policy to undo it.
          </p>
        ) : null}
      </Panel>

      {unknownOpen ? <OutcomePanel detail={detail} policyId={policyId} roleName={role} /> : null}
      <StuckApplyingPanel detail={detail} policyId={policyId} roleName={role} />

      {d.delivery !== "direct" ? <DeliveryPanel detail={detail} progress={progress} /> : null}
      {d.delivery === "export" && row && d.kind === "apply" ? <ExportPanel ws={ws} policyId={row.policy_id} versionNo={row.version_no} /> : null}

      <VerificationPanel lines={lines} />

      {moves ? <MigrationsPanel items={detail.migrations} revert={d.kind === "split_revert"} /> : null}

      <ServiceOutcomesPanel outcomes={detail.service_outcomes} />

      <ValidationsPanel
        items={detail.validations}
        action={
          author.offered ? (
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
              Declare a test call
            </Button>
          ) : undefined
        }
      />

      <HealthReportsPanel
        items={detail.health_reports}
        nameOf={nameOf}
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setReport("problem")}>
              Report a problem
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReport("working")}>
              It is working
            </Button>
          </>
        }
      />

      <AttemptsPanel detail={detail} />
      <RevalidationsPanel items={detail.revalidations} />
      <AcceptancesPanel items={detail.acceptances} nameOf={nameOf} />
      <LedgerPanel ledger={detail.ledger} />

      <Panel title="Plan reference">
        <details className="text-xs">
          <summary className="cursor-pointer text-(--color-text-muted) hover:text-(--color-text)">Hashes and identifiers</summary>
          <Facts className="mt-2">
            <Fact label="Plan hash" mono>{shortHash(detail.plan.plan_hash)}</Fact>
            <Fact label="Material hash" mono>{shortHash(detail.plan.material_hash)}</Fact>
            <Fact label="Impact hash" mono>{shortHash(detail.plan.impact_hash)}</Fact>
            {detail.plan.desired_document_hash ? <Fact label="Desired document" mono>{shortHash(detail.plan.desired_document_hash)}</Fact> : null}
            <Fact label="Evidence bundle" mono>{detail.evidence_bundle_id}</Fact>
            <Fact label="Role (ARN)" mono>{arn || roleNameOf(arn)}</Fact>
            <Fact label="Deployment id" mono>{d.id}</Fact>
          </Facts>
        </details>
      </Panel>

      {row && undoOpen ? (
        <UndoDialog ws={ws} deployment={row} siblings={ctx.siblings} siblingsPartial={ctx.siblingsPartial} open onOpenChange={setUndoOpen} />
      ) : null}
      <ValidationDialog deploymentId={d.id} roleName={role} open={testOpen} onOpenChange={setTestOpen} />
      <HealthReportDialog deploymentId={d.id} roleName={role} initialKind={report ?? "problem"} open={report !== null} onOpenChange={(o) => !o && setReport(null)} />
    </PolicyShell>
  );
}
