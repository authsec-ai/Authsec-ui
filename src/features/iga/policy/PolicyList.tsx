/**
 * PolicyList — runtime policy list page (TRD 2 Supplement, U01-U06).
 *
 * ConsolePage + AdaptiveTable + ConsoleFilterBar pattern matching
 * DiscoveredAgentsPage and CollectorsPage.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { AdaptiveTable } from "@/components/ui/adaptive-table";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { tableFailure } from "@/components/console/load-failure";

import {
  useListPoliciesQuery,
  type RuntimePolicy,
  type PolicyLifecycle,
} from "./policyApi";
import { ApprovePolicyButton } from "./ApprovePolicyButton";
import { LIFECYCLE_HELP } from "./lifecycleHelp";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Filter = "all" | PolicyLifecycle;

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
      return "warning";
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

function PolicyAgentLinks({
  agents,
}: {
  agents?: { id: string; display_name: string }[];
}) {
  if (!agents?.length) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="This revision does not target a workload adopted from a local agent."
      >
        No linked agent
      </span>
    );
  }
  return (
    <div className="flex max-w-[260px] flex-col gap-1">
      {agents.map((agent) => (
        <Link
          key={agent.id}
          to={`/iga/agents?agent=${agent.id}`}
          onClick={(event) => event.stopPropagation()}
          className="truncate text-xs font-medium text-(--color-primary) hover:underline"
          title={agent.display_name}
        >
          {agent.display_name}
        </Link>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PolicyListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: policies = [], isLoading, error, refetch } = useListPoliciesQuery();

  const items = useMemo(() => {
    let rows = policies;
    if (filter !== "all") {
      rows = rows.filter((p) => p.lifecycle === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.lifecycle.toLowerCase().includes(q) ||
          (p.agents ?? []).some((a) => a.display_name.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [policies, filter, search]);

  // Summary counts
  const total = policies.length;
  const draft = policies.filter((p) => p.lifecycle === "draft").length;
  const published = policies.filter((p) => p.lifecycle === "published").length;
  const revoked = policies.filter((p) => p.lifecycle === "revoked").length;

  const columns = useMemo<AdaptiveColumn<RuntimePolicy>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.name}
            detail={`v${row.original.current_draft_revision}`}
          />
        ),
      },
      {
        id: "agent",
        header: "Agent",
        alwaysVisible: true,
        cardSummary: true,
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => <PolicyAgentLinks agents={row.original.agents} />,
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        cardSummary: true,
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge
            tone={lifecycleTone(row.original.lifecycle)}
            title={LIFECYCLE_HELP[row.original.lifecycle]}
          >
            {LIFECYCLE_LABELS[row.original.lifecycle] ?? row.original.lifecycle}
          </StatusBadge>
        ),
      },
      {
        id: "revision",
        header: "Revision",
        priority: 2,
        approxWidth: 90,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            v{row.original.current_draft_revision}
          </span>
        ),
      },
      {
        id: "id",
        header: "ID",
        priority: 5,
        defaultHidden: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.id.slice(0, 8)}...
          </span>
        ),
      },
      {
        id: "approve",
        header: "",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => (
          <ApprovePolicyButton policyId={row.original.id} lifecycle={row.original.lifecycle} />
        ),
      },
      {
        id: "owner",
        header: "Owner",
        priority: 4,
        defaultHidden: true,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.owner_user_id || "\u2014"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Runtime Policies"
      description="Approved means the rules are signed off and not yet sent. Published means collectors are asked to follow that revision."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/iga/policies/new")}
        >
          <Plus className="size-4" />
          New policy
        </Button>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: total, title: undefined as string | undefined },
          { label: "Draft", value: draft, title: LIFECYCLE_HELP.draft },
          { label: "Published", value: published, title: LIFECYCLE_HELP.published },
          { label: "Revoked", value: revoked, title: LIFECYCLE_HELP.revoked },
        ].map(({ label, value, title }) => (
          <div
            key={label}
            title={title}
            className="rounded-lg border bg-card px-4 py-3 text-card-foreground"
          >
            <p className={`text-xs text-muted-foreground ${title ? "cursor-help" : ""}`}>{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or ID..."
        filters={[
          { key: "all", label: "All" },
          { key: "draft", label: "Draft", title: LIFECYCLE_HELP.draft },
          { key: "validated", label: "Validated", title: LIFECYCLE_HELP.validated },
          { key: "approved", label: "Approved", title: LIFECYCLE_HELP.approved },
          { key: "published", label: "Published", title: LIFECYCLE_HELP.published },
          { key: "revoked", label: "Revoked", title: LIFECYCLE_HELP.revoked },
        ]}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="iga-runtime-policies"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(r) => navigate(`/iga/policies/${r.id}`)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "policies", () => refetch(), "iga:policy:read")}
            emptyState={
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No runtime policies configured yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate("/iga/policies/new")}
                >
                  Create your first policy
                </Button>
              </div>
            }
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
