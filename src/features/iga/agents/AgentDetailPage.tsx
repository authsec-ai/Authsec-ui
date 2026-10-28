/**
 * AgentDetailPage — detail view for a single discovery agent (Batch 17).
 *
 * Follows the ConsolePage variant="object" + Panel/Facts pattern from
 * PolicyDetail. Six tabs: Overview, Instances, Policy, Identity,
 * Identity Graph, Actions.
 */

import React, { Suspense, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Server } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { type AdaptiveColumn, AdaptiveTable } from "@/components/ui/adaptive-table";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

import {
  useGetInventoryAgentQuery,
  useGetAgentInstancesQuery,
  useGetAgentEffectivePolicyQuery,
  type DiscoveryAgent,
  type AgentInstanceRow,
  type EffectivePolicyRevision,
  type PrimitiveCoverage,
  type IdentityState,
} from "@/app/api/agentInventoryApi";

import { AgentBindingPanel } from "@/features/iga/policy";

const IdentityGraphTab = React.lazy(() => import("../estate/IdentityGraphTab"));
const ActionsTab = React.lazy(() => import("../estate/ActionsTab"));

// ── Helpers ──────────────────────────────────────────────────────────────────

function identityStateTone(state: IdentityState): ConsoleTone {
  switch (state) {
    case "verified":
    case "registered":
      return "success";
    case "attested":
      return "info";
    case "pending":
    case "unregistered":
      return "warning";
    case "disabled":
    case "ignored":
      return "neutral";
    case "revoked":
    case "quarantined":
      return "danger";
    default:
      return "neutral";
  }
}

const IDENTITY_STATE_LABELS: Record<IdentityState, string> = {
  pending: "Pending",
  attested: "Attested",
  verified: "Verified",
  disabled: "Disabled",
  revoked: "Revoked",
  unregistered: "Unregistered",
  registered: "Registered",
  quarantined: "Quarantined",
  ignored: "Ignored",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type TabKey = "overview" | "instances" | "policy" | "identity" | "identity-graph" | "actions";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "instances", label: "Instances" },
  { key: "policy", label: "Policy" },
  { key: "identity", label: "Identity" },
  { key: "identity-graph", label: "Identity Graph" },
  { key: "actions", label: "Actions" },
];

// ── Tab content: Overview ────────────────────────────────────────────────────

function OverviewTab({ agent }: { agent: DiscoveryAgent }) {
  return (
    <div className="space-y-4">
      <Panel title="Agent Details">
        <Facts>
          <Fact label="Agent ID" mono>{agent.id}</Fact>
          <Fact label="Workspace ID" mono>{agent.workspace_id}</Fact>
          <Fact label="Workload ID" mono>{agent.workload_id}</Fact>
          <Fact label="Workload Name">{agent.workload_name}</Fact>
          <Fact label="Runtime Kind">
            <StatusBadge tone={agent.runtime_kind === "kubernetes" ? "success" : "info"}>
              {agent.runtime_kind}
            </StatusBadge>
          </Fact>
          <Fact label="Owner">{agent.owner_user_id ?? "\u2014"}</Fact>
          <Fact label="Created">{new Date(agent.created_at).toLocaleString()}</Fact>
          <Fact label="Last Seen">{relativeTime(agent.last_seen_at)}</Fact>
        </Facts>
      </Panel>

      <Panel title="Identity Summary">
        <Facts>
          <Fact label="Identity State">
            <StatusBadge tone={identityStateTone(agent.identity_state)}>
              {IDENTITY_STATE_LABELS[agent.identity_state] ?? agent.identity_state}
            </StatusBadge>
          </Fact>
          <Fact label="Identity Mode">{agent.identity_mode || "\u2014"}</Fact>
          <Fact label="SPIFFE ID" mono>{agent.spiffe_id ?? "\u2014"}</Fact>
        </Facts>
      </Panel>

      {agent.enforcement_summary && (
        <Panel title="Enforcement Summary">
          <Facts>
            <Fact label="Backend">{agent.enforcement_summary.backend}</Fact>
            <Fact label="State">{agent.enforcement_summary.state}</Fact>
            <Fact label="Coverage">{agent.enforcement_summary.coverage_pct}%</Fact>
          </Facts>
        </Panel>
      )}

      {agent.policy_summary && (
        <Panel title="Policy Summary">
          <Facts>
            <Fact label="Total Policies">{agent.policy_summary.policy_count}</Fact>
            <Fact label="Published">{agent.policy_summary.published_count}</Fact>
            <Fact label="Draft">{agent.policy_summary.draft_count}</Fact>
          </Facts>
        </Panel>
      )}
    </div>
  );
}

// ── Tab content: Instances ───────────────────────────────────────────────────

function InstancesTab({ agentId }: { agentId: string }) {
  const { data: instances = [], isLoading, error } = useGetAgentInstancesQuery(agentId);

  const columns = useMemo<AdaptiveColumn<AgentInstanceRow>[]>(
    () => [
      {
        id: "execution_id",
        header: "Execution ID",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.execution_id}</span>
        ),
      },
      {
        id: "principal",
        header: "Principal",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-xs">{row.original.principal}</span>
        ),
      },
      {
        id: "backend",
        header: "Backend",
        priority: 2,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-xs">{row.original.backend}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === "active" ? "success" : "neutral"}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "policy_digest",
        header: "Policy Digest",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.policy_digest.slice(0, 16)}...
          </span>
        ),
      },
      {
        id: "last_seen",
        header: "Last Seen",
        priority: 5,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeTime(row.original.last_seen_at ?? null)}
          </span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-(--color-surface-subtle)" />;
  }

  if (error) {
    return (
      <Panel title="Instances">
        <p className="text-sm text-(--color-text-muted)">Failed to load agent instances.</p>
      </Panel>
    );
  }

  if (instances.length === 0) {
    return (
      <Panel title="Instances">
        <p className="text-sm text-(--color-text-muted)">
          No active instances found for this agent.
        </p>
      </Panel>
    );
  }

  return (
    <TableCard>
      <CardContent variant="flush">
        <AdaptiveTable
          tableId="agent-instances"
          columns={columns}
          data={instances}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: true }}
          sizing="fit"
          cardsBelow={640}
          loading={false}
          emptyState={
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No instances found.</p>
            </div>
          }
        />
      </CardContent>
    </TableCard>
  );
}

// ── Tab content: Policy ──────────────────────────────────────────────────────

function PolicyTab({ agentId }: { agentId: string }) {
  const {
    data: effectivePolicy,
    isLoading,
    error,
  } = useGetAgentEffectivePolicyQuery(agentId);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-(--color-surface-subtle)" />;
  }

  if (error) {
    return (
      <Panel title="Effective Policy">
        <p className="text-sm text-(--color-text-muted)">Failed to load effective policy.</p>
      </Panel>
    );
  }

  const revisions: EffectivePolicyRevision[] = effectivePolicy?.contributing_revisions ?? [];
  const coverage: PrimitiveCoverage[] = effectivePolicy?.primitive_coverage ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Contributing Revisions"
        count={`${revisions.length} revision${revisions.length === 1 ? "" : "s"}`}
        flush
      >
        {revisions.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-(--color-text-muted)">No contributing policy revisions.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-left text-xs text-(--color-text-muted)">
                <th className="px-4 py-2 font-medium">Policy</th>
                <th className="px-4 py-2 font-medium">Revision</th>
                <th className="px-4 py-2 font-medium">Format</th>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Content Hash</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((r) => (
                <tr
                  key={`${r.policy_id}-${r.revision}`}
                  className="border-b border-(--color-border-subtle) last:border-b-0"
                >
                  <td className="px-4 py-2 text-xs">{r.policy_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">v{r.revision}</td>
                  <td className="px-4 py-2 text-xs text-(--color-text-muted)">{r.format}</td>
                  <td className="px-4 py-2 text-xs">{r.state}</td>
                  <td className="px-4 py-2 font-mono text-xs text-(--color-text-muted)">
                    {r.content_hash.slice(0, 16)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        title="Primitive Coverage"
        count={`${coverage.length} primitive${coverage.length === 1 ? "" : "s"}`}
        flush
      >
        {coverage.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-(--color-text-muted)">No primitive coverage data available.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-left text-xs text-(--color-text-muted)">
                <th className="px-4 py-2 font-medium">Primitive</th>
                <th className="px-4 py-2 font-medium">Discovery</th>
                <th className="px-4 py-2 font-medium">Enforcement</th>
                <th className="px-4 py-2 font-medium">Backend</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr
                  key={c.primitive_id}
                  className="border-b border-(--color-border-subtle) last:border-b-0"
                >
                  <td className="px-4 py-2 font-mono text-xs">{c.primitive_id}</td>
                  <td className="px-4 py-2 text-xs">{c.discovery_status}</td>
                  <td className="px-4 py-2 text-xs">{c.enforcement_status}</td>
                  <td className="px-4 py-2 text-xs text-(--color-text-muted)">
                    {c.backend ?? "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <AgentBindingPanel agentId={agentId} />
    </div>
  );
}

// ── Tab content: Identity ────────────────────────────────────────────────────

function IdentityTab({ agent }: { agent: DiscoveryAgent }) {
  return (
    <div className="space-y-4">
      <Panel title="Identity Details">
        <Facts>
          <Fact label="Identity State">
            <StatusBadge tone={identityStateTone(agent.identity_state)}>
              {IDENTITY_STATE_LABELS[agent.identity_state] ?? agent.identity_state}
            </StatusBadge>
          </Fact>
          <Fact label="Identity Mode">{agent.identity_mode || "\u2014"}</Fact>
          <Fact label="SPIFFE ID" mono>{agent.spiffe_id ?? "\u2014"}</Fact>
        </Facts>
      </Panel>

      <Panel title="Binding Information">
        <Facts>
          <Fact label="Workload ID" mono>{agent.workload_id}</Fact>
          <Fact label="Runtime Kind">
            <StatusBadge tone={agent.runtime_kind === "kubernetes" ? "success" : "info"}>
              {agent.runtime_kind}
            </StatusBadge>
          </Fact>
          {agent.enforcement_summary && (
            <>
              <Fact label="Enforcement Backend">{agent.enforcement_summary.backend}</Fact>
              <Fact label="Enforcement State">{agent.enforcement_summary.state}</Fact>
            </>
          )}
        </Facts>
      </Panel>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Tab from URL hash (simpler than URL params for a detail page)
  const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  const activeTab: TabKey = TABS.some((t) => t.key === hash) ? (hash as TabKey) : "overview";

  const {
    data: agent,
    isLoading,
    error,
  } = useGetInventoryAgentQuery(id!, { skip: !id });

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ConsolePage
        variant="object"
        title="Discovery Agent"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/all-agents")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <div className="h-64 animate-pulse rounded-lg bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading agent" />
      </ConsolePage>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <ConsolePage
        variant="object"
        title="Discovery Agent"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/all-agents")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Error">
          <p className="text-sm text-(--color-text-muted)">
            Failed to load the agent. It may have been deleted or you may not have access.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/iga/all-agents")}>
            Return to agent list
          </Button>
        </Panel>
      </ConsolePage>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────

  if (!agent) {
    return (
      <ConsolePage
        variant="object"
        title="Discovery Agent"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/all-agents")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Not Found">
          <p className="text-sm text-(--color-text-muted)">The requested agent could not be found.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/iga/all-agents")}>
            Return to agent list
          </Button>
        </Panel>
      </ConsolePage>
    );
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  return (
    <ConsolePage
      variant="object"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Server className="size-5 text-(--color-text-muted)" />
          {agent.workload_name}
          <StatusBadge tone={identityStateTone(agent.identity_state)}>
            {IDENTITY_STATE_LABELS[agent.identity_state] ?? agent.identity_state}
          </StatusBadge>
        </span>
      }
      description={`Agent ${agent.id.slice(0, 8)}... \u00b7 ${agent.runtime_kind}`}
      actions={
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/iga/all-agents")}>
          <ArrowLeft className="size-4" />
          Back to Locally discovered processes
        </Button>
      }
    >
      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-(--color-border-subtle) pb-px">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              window.location.hash = key;
              // Force re-render by navigating to current path
              navigate(`/iga/all-agents/${id}#${key}`, { replace: true });
            }}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-b-2 border-(--color-border-active) text-(--color-text)"
                : "text-(--color-text-muted) hover:text-(--color-text)"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "overview" && <OverviewTab agent={agent} />}
        {activeTab === "instances" && <InstancesTab agentId={agent.id} />}
        {activeTab === "policy" && <PolicyTab agentId={agent.id} />}
        {activeTab === "identity" && <IdentityTab agent={agent} />}
        {activeTab === "identity-graph" && (
          agent.workload_id ? (
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-(--color-surface-subtle)" />}>
              <IdentityGraphTab
                workspaceId={agent.workspace_id}
                workloadId={agent.workload_id}
                workloadName={agent.workload_name}
              />
            </Suspense>
          ) : (
            <p className="text-sm text-(--color-text-muted)">
              This process has no adopted workload yet, so there is no identity graph to draw.
            </p>
          )
        )}
        {activeTab === "actions" && (
          <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-(--color-surface-subtle)" />}>
            <ActionsTab
              workspaceId={agent.workspace_id}
              workloadId={agent.workload_id}
            />
          </Suspense>
        )}
      </div>
    </ConsolePage>
  );
}
