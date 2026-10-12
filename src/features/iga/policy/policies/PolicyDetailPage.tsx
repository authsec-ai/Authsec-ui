/**
 * Policy › detail (SPEC-iga-phase3-policy.md §9.3 S5, route
 * `/iga/policy/policies/:id/:tab?`): one policy, its header, and seven tabs
 * (overview, targets, owners, rollout, deployments, events, versions).
 *
 * The header states the facts the policy list row cannot hold, each from its
 * own source: the policy and its current version (`GET /policies/:id`), the
 * rollout stage (`GET /policies/:id/rollout`, 404 `rollout_not_started` is
 * "not started"), and the boundary state read out of the rollout's deployments.
 * Tabs that belong to other screens are mounted, not re-implemented
 * (PlanView, RolloutTab, PolicyDeploymentsTab, ApprovalPanel, RemoveControlDialog).
 * A read that failed is a banner with Retry, never an empty tab.
 */

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useGetGovPolicyQuery, useListGovVersionsQuery } from "@/app/api/igaPolicyAuthoringApi";
import { StatusBadge } from "@/components/console/status";
import { ObjectTabs, type ObjectTab } from "@/features/iga/shared/components/ObjectTabs";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyDeploymentsTab } from "../deployments/PolicyDeploymentsTab";
import { PlanView } from "../plans/PlanView";
import { RolloutTab } from "../rollout/RolloutTab";
import { PolicyLoadFailure, PolicyShell, StateChip, classifyPolicyError, delivery, lifecycle, rolloutStage, usePolicyPermission, useWorkspaceMemberSession, versionStatus } from "../shared";
import { EventsTab } from "./EventsTab";
import { OverviewTab } from "./OverviewTab";
import { OwnersTab } from "./OwnersTab";
import { PolicyIdentityEdit } from "./PolicyIdentityEdit";
import { PolicyMenu } from "./PolicyMenu";
import { VersionsTab } from "./VersionsTab";
import { POLICIES_PATH, familyLabel, parseTab, policyHref, providerLabel, statusLines, type PolicyTab } from "./policyModel";
import { useVersionApproval, useVersionReview, usePolicyRollout } from "./usePolicyFacts";
import { useMemberNames } from "./useMemberNames";

const TAB_LABEL: Record<PolicyTab, string> = {
  overview: "Overview",
  targets: "Targets",
  owners: "Owners & review",
  rollout: "Rollout",
  deployments: "Deployments",
  events: "Events",
  versions: "Versions",
};

export default function PolicyDetailPage() {
  const { id = "", tab } = useParams();
  const ws = getWorkspaceId() ?? "";
  // Ensure a workspace-member session before member-gated actions (approve/reject/propose).
  useWorkspaceMemberSession();
  const active = parseTab(tab);
  const [params] = useSearchParams();
  const [renaming, setRenaming] = useState(false);
  const author = usePolicyPermission("governance:author");
  const nameOf = useMemberNames(ws);

  const policyQ = useGetGovPolicyQuery({ ws, policyId: id }, { skip: !id });
  const versionsQ = useListGovVersionsQuery({ ws, policyId: id }, { skip: !id });
  const policy = policyQ.currentData;
  const version = policy?.current_version;

  const rollout = usePolicyRollout(ws, id);
  const reviewable = !!version && version.status !== "draft";
  const review = useVersionReview(ws, id, version?.no, reviewable);
  const approval = useVersionApproval(ws, version?.id, version?.status === "approved" || (rollout.rollout !== null && rollout.rollout !== "unknown"), nameOf);

  const failure = classifyPolicyError(policyQ.error);
  const refetchAll = () => {
    void policyQ.refetch();
    void versionsQ.refetch();
    rollout.refetch();
  };

  if (!policy) {
    return (
      <PolicyShell title="Policy">
        {failure ? (
          <div className="space-y-3">
            <PolicyLoadFailure failure={failure} subject="this policy" onRetry={() => void policyQ.refetch()} />
            <Link to={POLICIES_PATH} className="text-sm font-medium text-(--color-primary-text) hover:underline">
              Back to Policies
            </Link>
          </div>
        ) : (
          <p role="status" className="text-sm text-(--color-text-muted)">
            Loading the policy…
          </p>
        )}
      </PolicyShell>
    );
  }

  const tabs: ObjectTab[] = (Object.keys(TAB_LABEL) as PolicyTab[]).map((k) => ({ key: k, label: TAB_LABEL[k], to: policyHref(id, k) }));
  const shownNo = Number(params.get("version")) || version?.no;
  const intent = version?.intent;
  const deliveryName = intent && "delivery" in intent ? delivery(intent.delivery) : "";
  const boundary = rollout.rollout === "unknown" ? null : statusLines(rollout.rollout).find((l) => l.key === "boundary");
  const stage = rollout.rollout && rollout.rollout !== "unknown" ? rollout.rollout.rollout.stage : "";
  const versions = versionsQ.data;
  const archived = policy.lifecycle === "archived";

  const facts = [
    familyLabel(policy.family),
    providerLabel(policy.provider),
    policy.scope_summary || "No roles",
    version ? `version ${version.no}` : "no version yet",
    deliveryName,
    policy.owner ? `owner ${nameOf(policy.owner)}` : "no owner",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PolicyShell
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          {policy.name}
          {author.offered && !archived ? (
            <button
              type="button"
              onClick={() => setRenaming((r) => !r)}
              aria-label="Edit name and purpose"
              aria-expanded={renaming}
              className="grid size-7 place-items-center rounded-md text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      }
      description={policy.purpose ? `${facts}. ${policy.purpose}` : facts}
      actions={<PolicyMenu ws={ws} policy={policy} versions={versions} onReload={refetchAll} />}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StateChip state={lifecycle(policy.lifecycle)} />
        {policy.status ? <StateChip state={versionStatus(policy.status)} /> : null}
        {stage ? <StateChip state={rolloutStage(stage)} /> : null}
        {boundary && boundary.text !== "No evidence yet" ? <StatusBadge tone={boundary.tone}>{`Boundary: ${boundary.text}`}</StatusBadge> : null}
        <Link to={`${POLICIES_PATH}`} className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          All policies
        </Link>
      </div>

      {renaming ? <PolicyIdentityEdit policy={policy} onDone={() => setRenaming(false)} /> : null}
      {archived ? (
        <p role="status" className="rounded-md border-l-2 border-l-(--color-border-strong) bg-(--color-surface-subtle) px-4 py-2.5 text-[13px] text-(--color-text)">
          This policy is archived and read-only. Its history stays here.
        </p>
      ) : null}
      {policyQ.isError ? (
        <PolicyLoadFailure failure={failure ?? { kind: "failed", code: "", message: "", detail: {} }} subject="this policy" onRetry={() => void policyQ.refetch()} />
      ) : null}

      <ObjectTabs tabs={tabs} active={active} />

      {active === "overview" ? (
        <OverviewTab ws={ws} policy={policy} version={version} review={review} rollout={rollout} approval={approval} />
      ) : active === "targets" ? (
        shownNo ? <PlanView ws={ws} policyId={id} versionNo={shownNo} /> : <NoVersion />
      ) : active === "owners" ? (
        <OwnersTab ws={ws} version={version} review={review} />
      ) : active === "rollout" ? (
        <RolloutTab ws={ws} policyId={id} />
      ) : active === "deployments" ? (
        <PolicyDeploymentsTab ws={ws} policyId={id} />
      ) : active === "events" ? (
        <EventsTab ws={ws} policyId={id} nameOf={nameOf} />
      ) : versionsQ.isError && !versions ? (
        <PolicyLoadFailure failure={classifyPolicyError(versionsQ.error) ?? { kind: "failed", code: "", message: "", detail: {} }} subject="the versions" onRetry={() => void versionsQ.refetch()} />
      ) : versions ? (
        <VersionsTab policyId={id} versions={versions} currentNo={version?.no} approvedNo={policy.approved_version_no} nameOf={nameOf} />
      ) : (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Loading the versions…
        </p>
      )}
    </PolicyShell>
  );
}

function NoVersion() {
  return <p className="text-sm text-(--color-text-muted)">This policy has no version yet, so it has no targets.</p>;
}
