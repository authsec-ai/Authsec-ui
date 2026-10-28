/**
 * PolicyDetail -- tabbed detail page for a single runtime policy.
 *
 * Follows the ObjectShell / ConsolePage pattern: a compact header with
 * variant="object", tab navigation via URL param, and Panel/Facts for
 * the overview surface. Lifecycle actions are contextual to the current
 * policy state.
 */

import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Send,
  RotateCcw,
  XCircle,
  FlaskConical,
  GitCompareArrows,
} from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

import {
  useGetPolicyQuery,
  useGetRolloutQuery,
  type PolicyLifecycle,
  type PolicyWithRevisions,
  type PolicyRevision,
  type RuntimePolicyV2Document,
  type PolicyEscalation,
  type PolicyV2Rule,
  type AuthoredModule,
} from "./policyApi";
import { OpaViewer } from "./OpaViewer";
import { EscalationEditor } from "./EscalationEditor";
import { RuleForm } from "./RuleForm";
import { ApprovePolicyButton } from "./ApprovePolicyButton";
import { TestPolicyDrawer } from "./TestPolicyDrawer";
import { CompiledControlsTab } from "./CompiledControlsTab";
import { CandidateGenerationPanel } from "./CandidateGenerationPanel";
import { RevisionDiffView } from "./RevisionDiffView";
import { PublishDialog, type RolloutTargetSummary } from "./PublishDialog";
import { EvidenceTraceDrawer } from "./EvidenceTraceDrawer";
import { LIFECYCLE_HELP } from "./lifecycleHelp";

// ── Lifecycle badge mapping ──────────────────────────────────────────────────

function lifecycleTone(lc: PolicyLifecycle): ConsoleTone {
  switch (lc) {
    case "draft":
      return "neutral";
    case "validated":
      return "info";
    case "simulated":
      return "info";
    case "approved":
      return "warning";
    case "published":
      return "success";
    case "superseded":
      return "neutral";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

const LIFECYCLE_LABELS: Record<PolicyLifecycle, string> = {
  draft: "Draft",
  validated: "Validated",
  simulated: "Simulated",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
  revoked: "Revoked",
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

type TabKey = "overview" | "rules" | "controls" | "opa" | "escalations" | "history" | "deployments";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rules", label: "Rules" },
  { key: "controls", label: "Controls" },
  { key: "opa", label: "OPA" },
  { key: "escalations", label: "Escalations" },
  { key: "history", label: "History" },
  { key: "deployments", label: "Deployments" },
];

function PolicyAgentLinks({ agents }: { agents?: { id: string; display_name: string }[] }) {
  if (!agents?.length) {
    return (
      <span className="text-sm text-(--color-text-muted)" title="This revision does not target a workload adopted from a local agent.">
        No linked agent
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      {agents.map((agent) => (
        <Link
          key={agent.id}
          to={`/iga/agents?agent=${agent.id}`}
          className="text-sm text-(--color-primary) hover:underline"
        >
          {agent.display_name}
        </Link>
      ))}
    </span>
  );
}

// ── Tab content: Overview ────────────────────────────────────────────────────

function OverviewTab({ data, onPublish }: { data: PolicyWithRevisions; onPublish?: () => void }) {
  const { policy, revisions } = data;
  const latestRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;

  return (
    <div className="space-y-4">
      <Panel title="Policy Info">
        <Facts>
          <Fact label="Name">{policy.name}</Fact>
          <Fact label="ID" mono>{policy.id}</Fact>
          <Fact label="Lifecycle">
            <StatusBadge tone={lifecycleTone(policy.lifecycle)} title={LIFECYCLE_HELP[policy.lifecycle]}>
              {LIFECYCLE_LABELS[policy.lifecycle] ?? policy.lifecycle}
            </StatusBadge>
          </Fact>
          <Fact label="Agent">
            <PolicyAgentLinks agents={policy.agents} />
          </Fact>
          <Fact label="Current Revision">v{policy.current_draft_revision}</Fact>
          <Fact label="Owner">{policy.owner_user_id}</Fact>
        </Facts>
        <p className="mt-3 text-sm text-(--color-text-muted)">{LIFECYCLE_HELP[policy.lifecycle]}</p>
      </Panel>

      {latestRevision && (
        <Panel title="Latest Revision">
          <Facts>
            <Fact label="Revision #">v{latestRevision.revision}</Fact>
            <Fact label="Content Hash" mono>{latestRevision.content_hash}</Fact>
            <Fact label="Author">{latestRevision.author_user_id}</Fact>
            <Fact label="State">
              <StatusBadge tone={lifecycleTone(latestRevision.state)} title={LIFECYCLE_HELP[latestRevision.state]}>
                {LIFECYCLE_LABELS[latestRevision.state] ?? latestRevision.state}
              </StatusBadge>
            </Fact>
          </Facts>
        </Panel>
      )}

      <LifecycleActions policyId={policy.id} lifecycle={policy.lifecycle} etag={data.etag} onPublish={onPublish} />
    </div>
  );
}

// ── Lifecycle action buttons ─────────────────────────────────────────────────

function LifecycleActions({
  policyId,
  lifecycle,
  etag,
  onPublish,
}: {
  policyId: string;
  lifecycle: PolicyLifecycle;
  etag: string;
  onPublish?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ApprovePolicyButton policyId={policyId} lifecycle={lifecycle} etag={etag} />
      {lifecycle === "approved" && (
        <Button size="sm" className="gap-1.5" onClick={onPublish}>
          <Send className="size-4" />
          Publish
        </Button>
      )}
      {lifecycle === "published" && (
        <>
          <Button size="sm" variant="outline" className="gap-1.5">
            <RotateCcw className="size-4" />
            Rollback
          </Button>
          <Button size="sm" variant="destructive" className="gap-1.5">
            <XCircle className="size-4" />
            Revoke
          </Button>
        </>
      )}
    </div>
  );
}

// ── Tab content: Rules (placeholder) ─────────────────────────────────────────

function RulesTab({ data }: { data: PolicyWithRevisions }) {
  return (
    <div className="space-y-4">
      {data.policy.lifecycle === "draft" && (
        <CandidateGenerationPanel policyId={data.policy.id} />
      )}
      <RuleForm
        policyId={data.policy.id}
        policyName={data.policy.name}
        lifecycle={data.policy.lifecycle}
        revisions={data.revisions}
        etag={data.etag}
      />
    </div>
  );
}

// ── Tab content: History ─────────────────────────────────────────────────────

function HistoryTab({ policyId, revisions }: { policyId: string; revisions: PolicyRevision[] }) {
  const [showDiff, setShowDiff] = useState(false);

  if (revisions.length === 0) {
    return (
      <Panel title="Revision History">
        <p className="text-sm text-(--color-text-muted)">No revisions recorded.</p>
      </Panel>
    );
  }

  const revisionNumbers = revisions.map((r) => r.revision);

  return (
    <div className="space-y-4">
      <Panel
        title="Revision History"
        count={`${revisions.length} revision${revisions.length === 1 ? "" : "s"}`}
        actions={
          revisions.length >= 2 ? (
            <Button
              variant={showDiff ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowDiff((v) => !v)}
            >
              <GitCompareArrows className="size-3.5" />
              Diff
            </Button>
          ) : undefined
        }
        flush
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border-subtle) text-left text-xs text-(--color-text-muted)">
              <th className="px-4 py-2 font-medium">Revision</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Content Hash</th>
              <th className="px-4 py-2 font-medium">Author</th>
            </tr>
          </thead>
          <tbody>
            {[...revisions].reverse().map((rev) => (
              <tr key={rev.revision} className="border-b border-(--color-border-subtle) last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs">v{rev.revision}</td>
                <td className="px-4 py-2">
                  <StatusBadge tone={lifecycleTone(rev.state)} title={LIFECYCLE_HELP[rev.state]}>
                    {LIFECYCLE_LABELS[rev.state] ?? rev.state}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-(--color-text-muted)">{rev.content_hash.slice(0, 16)}...</td>
                <td className="px-4 py-2 text-xs text-(--color-text-muted)">{rev.author_user_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {showDiff && (
        <RevisionDiffView policyId={policyId} revisions={revisionNumbers} />
      )}
    </div>
  );
}

// ── Tab content: Deployments ─────────────────────────────────────────────────

function DeploymentsTab({
  policyId,
  onTargetClick,
}: {
  policyId: string;
  onTargetClick?: (workloadId: string) => void;
}) {
  const { data: rollout, isLoading, error } = useGetRolloutQuery(policyId);

  if (isLoading) {
    return (
      <Panel title="Rollout Status">
        <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading rollout" />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Rollout Status">
        <p className="text-sm text-(--color-text-muted)">
          Unable to load rollout status. The policy may not have been published yet.
        </p>
      </Panel>
    );
  }

  if (!rollout) {
    return (
      <Panel title="Rollout Status">
        <p className="text-sm text-(--color-text-muted)">No rollout data available.</p>
      </Panel>
    );
  }

  const { aggregate, targets } = rollout;

  return (
    <div className="space-y-4">
      <Panel title="Aggregate Counts">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            { label: "Total", value: aggregate.total },
            { label: "Applied", value: aggregate.applied },
            { label: "Verified", value: aggregate.verified },
            { label: "Failed", value: aggregate.failed },
            { label: "Pending", value: aggregate.pending },
          ] as const).map(({ label, value }) => (
            <div key={label} className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-center">
              <p className="text-xs text-(--color-text-muted)">{label}</p>
              <p className="text-xl font-semibold tabular-nums text-(--color-text)">{value}</p>
            </div>
          ))}
        </div>
      </Panel>

      {targets.length > 0 && (
        <Panel title="Targets" count={`${targets.length} target${targets.length === 1 ? "" : "s"}`} flush>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-left text-xs text-(--color-text-muted)">
                <th className="px-4 py-2 font-medium">Workload</th>
                <th className="px-4 py-2 font-medium">Instance</th>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Controls</th>
                <th className="px-4 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={`${t.workload_id}-${t.instance_id}`} className="border-b border-(--color-border-subtle) last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    {onTargetClick ? (
                      <button
                        type="button"
                        onClick={() => onTargetClick(t.workload_id)}
                        className="text-left underline decoration-dotted underline-offset-2 hover:text-(--color-primary)"
                      >
                        {t.workload_id}
                      </button>
                    ) : (
                      t.workload_id
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-(--color-text-muted)">{t.instance_id}</td>
                  <td className="px-4 py-2 text-xs">{t.state}</td>
                  <td className="px-4 py-2 text-xs tabular-nums">{t.controls_verified}/{t.controls_total}</td>
                  <td className="px-4 py-2 text-xs text-(--color-text-muted)">{t.error ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

// ── Tab content: OPA ──────────────────────────────────────────────────────────

function OpaTab({ data }: { data: PolicyWithRevisions }) {
  const latestRevision = data.revisions.length > 0 ? data.revisions[data.revisions.length - 1] : null;

  let authoredModules: AuthoredModule[] = [];
  const generatedRego = latestRevision?.generated_rego || "";
  try {
    const doc = typeof latestRevision?.document === "string"
      ? JSON.parse(latestRevision.document) as RuntimePolicyV2Document
      : latestRevision?.document as unknown as RuntimePolicyV2Document;
    if (doc?.authored_modules) {
      authoredModules = doc.authored_modules;
    }
  } catch { /* not a V2 doc or invalid */ }

  return (
    <OpaViewer
      revision={latestRevision}
      generatedRego={generatedRego}
      authoredModules={authoredModules}
      compilerVersion={latestRevision?.compiler_version}
    />
  );
}

// ── Tab content: Escalations ─────────────────────────────────────────────────

function EscalationsTab({ data }: { data: PolicyWithRevisions }) {
  const latestRevision = data.revisions.length > 0 ? data.revisions[data.revisions.length - 1] : null;

  let escalations: PolicyEscalation[] = [];
  let rules: PolicyV2Rule[] = [];
  try {
    const doc = typeof latestRevision?.document === "string"
      ? JSON.parse(latestRevision.document) as RuntimePolicyV2Document
      : latestRevision?.document as unknown as RuntimePolicyV2Document;
    if (doc?.escalations) escalations = doc.escalations;
    if (doc?.rules) rules = doc.rules;
  } catch { /* not a V2 doc */ }

  return <EscalationEditor escalations={escalations} rules={rules} readOnly />;
}

// ── Main component ───────────────────────────────────────────────────────────

export function PolicyDetailPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [evidenceDrawer, setEvidenceDrawer] = useState<{
    open: boolean;
    workloadId: string;
  }>({ open: false, workloadId: "" });

  const activeTab: TabKey = (tab as TabKey) || "overview";
  const isValidTab = TABS.some((t) => t.key === activeTab);

  const {
    data,
    isLoading,
    error,
  } = useGetPolicyQuery(id!, { skip: !id });

  // Fetch rollout data for the publish dialog and evidence drawer
  const { data: rolloutData } = useGetRolloutQuery(id!, {
    skip: !id || !data,
  });

  // Build rollout target summaries for PublishDialog
  const rolloutTargets: RolloutTargetSummary[] = useMemo(
    () =>
      rolloutData?.targets?.map((t) => ({
        workload_id: t.workload_id,
        instance_id: t.instance_id,
      })) ?? [],
    [rolloutData?.targets],
  );

  // Compute environment readiness from policy state
  const readiness = useMemo(() => {
    if (!data) return undefined;
    const latestRevision =
      data.revisions.length > 0
        ? data.revisions[data.revisions.length - 1]
        : null;
    return {
      policyCompiled: !!latestRevision?.generated_rego || !!latestRevision?.compiler_version,
      allControlsValid:
        (rolloutData?.aggregate?.failed ?? 0) === 0 &&
        (rolloutData?.aggregate?.total ?? 0) > 0,
      approvalObtained:
        data.policy.lifecycle === "approved" ||
        data.policy.lifecycle === "published",
    };
  }, [data, rolloutData]);

  // Handler for clicking a deployment target to open the evidence drawer
  const handleTargetClick = (workloadId: string) => {
    setEvidenceDrawer({ open: true, workloadId });
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ConsolePage
        variant="object"
        title="Runtime Policy"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/policies")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <div className="h-64 animate-pulse rounded-lg bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading policy" />
      </ConsolePage>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <ConsolePage
        variant="object"
        title="Runtime Policy"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/policies")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Error">
          <p className="text-sm text-(--color-text-muted)">
            Failed to load the policy. It may have been deleted or you may not have access.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/iga/policies")}>
            Return to policy list
          </Button>
        </Panel>
      </ConsolePage>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────

  if (!data) {
    return (
      <ConsolePage
        variant="object"
        title="Runtime Policy"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/policies")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Not Found">
          <p className="text-sm text-(--color-text-muted)">The requested policy could not be found.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/iga/policies")}>
            Return to policy list
          </Button>
        </Panel>
      </ConsolePage>
    );
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  const { policy } = data;

  return (
    <ConsolePage
      variant="object"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <FileText className="size-5 text-(--color-text-muted)" />
          {policy.name}
          <StatusBadge tone={lifecycleTone(policy.lifecycle)} title={LIFECYCLE_HELP[policy.lifecycle]}>
            {LIFECYCLE_LABELS[policy.lifecycle] ?? policy.lifecycle}
          </StatusBadge>
        </span>
      }
      description={`Policy ${policy.id.slice(0, 8)}... \u00b7 revision v${policy.current_draft_revision}`}
      actions={
        <div className="flex items-center gap-2">
          <ApprovePolicyButton policyId={policy.id} lifecycle={policy.lifecycle} etag={data.etag} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTestDrawerOpen(true)}>
            <FlaskConical className="size-4" />
            Test
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/policies")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>
      }
    >
      {/* Test policy drawer */}
      <TestPolicyDrawer policyId={policy.id} open={testDrawerOpen} onClose={() => setTestDrawerOpen(false)} />

      {/* Publish dialog with rollout targets and readiness checklist */}
      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        policyId={policy.id}
        etag={data.etag}
        targets={rolloutTargets}
        readiness={readiness}
      />

      {/* Evidence trace drawer for deployment targets */}
      <EvidenceTraceDrawer
        open={evidenceDrawer.open}
        onClose={() => setEvidenceDrawer({ open: false, workloadId: "" })}
        workloadId={evidenceDrawer.workloadId}
        policyId={policy.id}
      />

      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-(--color-border-subtle)">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() =>
              navigate(
                t.key === "overview"
                  ? `/iga/policies/${id}`
                  : `/iga/policies/${id}/${t.key}`,
                { replace: true },
              )
            }
            className={
              t.key === activeTab
                ? "border-b-2 border-(--color-primary) px-3 py-2 text-sm font-semibold text-(--color-text)"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text)"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab body */}
      {!isValidTab ? (
        <Panel title="Unknown Tab">
          <p className="text-sm text-(--color-text-muted)">
            The tab "{tab}" is not recognised. Select a tab above.
          </p>
        </Panel>
      ) : activeTab === "overview" ? (
        <OverviewTab data={data} onPublish={() => setPublishDialogOpen(true)} />
      ) : activeTab === "rules" ? (
        <RulesTab data={data} />
      ) : activeTab === "controls" ? (
        <CompiledControlsTab
          policyId={policy.id}
          revision={policy.current_draft_revision}
        />
      ) : activeTab === "opa" ? (
        <OpaTab data={data} />
      ) : activeTab === "escalations" ? (
        <EscalationsTab data={data} />
      ) : activeTab === "history" ? (
        <HistoryTab policyId={policy.id} revisions={data.revisions} />
      ) : activeTab === "deployments" ? (
        <DeploymentsTab policyId={policy.id} onTargetClick={handleTargetClick} />
      ) : null}
    </ConsolePage>
  );
}

export default PolicyDetailPage;
