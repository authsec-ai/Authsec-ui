/**
 * AllAgentsPage — full discovery-agent inventory (Batch 17, UI01-UI12).
 *
 * ConsolePage + AdaptiveTable pattern matching PolicyList. Shows every
 * agent registered with the workspace, with KPI summary cards, filter bar,
 * and cursor-paginated table.
 */

import { useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { type AdaptiveColumn, AdaptiveTable } from "@/components/ui/adaptive-table";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { tableFailure } from "@/components/console/load-failure";

import {
  useListInventoryAgentsQuery,
  type DiscoveryAgent,
  type IdentityState,
  type RuntimeKind,
} from "@/app/api/agentInventoryApi";
import {
  useListHeldCandidatesQuery,
  type DiscoveryCandidateRow,
} from "@/app/api/discoveryApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Filter = "all" | "linux" | "kubernetes" | "attested" | "pending";

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

function runtimeKindTone(kind: RuntimeKind): ConsoleTone {
  switch (kind) {
    case "linux":
      return "info";
    case "kubernetes":
      return "success";
    default:
      return "neutral";
  }
}

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

// ── Main component ───────────────────────────────────────────────────────────

export default function AllAgentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useListInventoryAgentsQuery();
  const {
    data: heldData,
    isLoading: heldLoading,
    error: heldError,
    refetch: refetchHeld,
  } = useListHeldCandidatesQuery({ decision: "hold", limit: 500 });

  const agents = data?.agents ?? [];
  // Host containers are the newest and the most numerous. Cluster workloads
  // stay visible above that list.
  const held = useMemo(() => {
    const rows = heldData?.candidates ?? [];
    const rank = (kind: string) => (kind === "k8s.workload" ? 0 : kind === "docker.container" ? 2 : 1);
    return [...rows].sort((a, b) => {
      const byKind = rank(a.kind) - rank(b.kind);
      if (byKind !== 0) return byKind;
      return (a.display_name || "").localeCompare(b.display_name || "");
    });
  }, [heldData]);
  const heldTotal = heldData?.total ?? held.length;
  const heldFailure = tableFailure(heldError, "candidates", () => refetchHeld(), "discovery:read");

  // KPI counts (computed from ALL agents, not filtered — use a separate
  // un-filtered query if needed; for now we derive from result)
  const total = data?.total ?? agents.length;
  const linux = agents.filter((a) => a.runtime_kind === "linux").length;
  const kubernetes = agents.filter((a) => a.runtime_kind === "kubernetes").length;
  const identityPending = agents.filter(
    (a) => a.identity_state === "pending" || a.identity_state === "unregistered",
  ).length;

  // The discovery list does not understand runtime_kind or identity_state.
  // Those filters apply here, over the sightings the request returned.
  const items = useMemo(() => {
    const q = search.toLowerCase();
    return agents.filter((a) => {
      if (filter === "linux" || filter === "kubernetes") {
        if (a.runtime_kind !== filter) return false;
      }
      if (filter === "pending" && a.identity_state !== "pending" && a.identity_state !== "unregistered") {
        return false;
      }
      if (filter === "attested" && a.identity_state !== "attested" && a.identity_state !== "registered") {
        return false;
      }
      if (!q) return true;
      return (
        a.workload_name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.spiffe_id ?? "").toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      const byGraph = Number(!a.workload_id) - Number(!b.workload_id);
      if (byGraph !== 0) return byGraph;
      return a.workload_name.localeCompare(b.workload_name);
    });
  }, [agents, search, filter]);

  const handleRowClick = useCallback(
    (row: DiscoveryAgent) => navigate(row.workload_id ? `/iga/all-agents/${row.id}#identity-graph` : `/iga/all-agents/${row.id}`),
    [navigate],
  );

  const columns = useMemo<AdaptiveColumn<DiscoveryAgent>[]>(
    () => [
      {
        id: "workload",
        header: "Workload",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.workload_name}
            detail={
              <>
                {[
                  row.original.runtime_status
                    ? `${row.original.runtime_kind} · ${row.original.runtime_status}`
                    : row.original.runtime_kind,
                  row.original.also_seen?.length
                    ? `also seen as ${row.original.also_seen.join(", ")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {row.original.workload_id ? (
                  <>
                    {" · "}
                    <Link
                      to={`/iga/all-agents/${row.original.id}#identity-graph`}
                      className="font-medium text-(--color-primary-text) hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Identity graph
                    </Link>
                  </>
                ) : null}
              </>
            }
          />
        ),
      },
      {
        id: "runtime_kind",
        header: "Runtime Kind",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge tone={runtimeKindTone(row.original.runtime_kind)}>
            {row.original.runtime_kind}
          </StatusBadge>
        ),
      },
      {
        id: "identity_state",
        header: "Identity State",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge tone={identityStateTone(row.original.identity_state)}>
            {IDENTITY_STATE_LABELS[row.original.identity_state] ?? row.original.identity_state}
          </StatusBadge>
        ),
      },
      {
        id: "spiffe_id",
        header: "SPIFFE ID",
        priority: 3,
        approxWidth: 240,
        cell: ({ row }) => (
          <span className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
            {row.original.spiffe_id ?? "\u2014"}
          </span>
        ),
      },
      {
        id: "backend",
        header: "Backend",
        priority: 4,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.enforcement_summary?.backend ?? "\u2014"}
          </span>
        ),
      },
      {
        id: "coverage",
        header: "Coverage",
        priority: 5,
        approxWidth: 90,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">
            {row.original.enforcement_summary
              ? `${row.original.enforcement_summary.coverage_pct}%`
              : "\u2014"}
          </span>
        ),
      },
      {
        id: "last_seen",
        header: "Last Seen",
        priority: 6,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeTime(row.original.last_seen_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Locally discovered processes"
      description="Full inventory of discovery agents across your workspace, including identity state, enforcement coverage, and runtime details."
    >
      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total", value: total },
          { label: "Linux", value: linux },
          { label: "Kubernetes", value: kubernetes },
          { label: "Identity Pending", value: identityPending },
          { label: "Held", value: heldTotal },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border bg-card px-4 py-3 text-card-foreground"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by workload name, ID, or SPIFFE ID..."
        filters={[
          { key: "all", label: "All" },
          { key: "linux", label: "Linux" },
          { key: "kubernetes", label: "Kubernetes" },
          { key: "attested", label: "Attested" },
          { key: "pending", label: "Pending" },
        ]}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="iga-all-agents"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={handleRowClick}
            pagination={{
              pageSize: 20,
              pageSizeOptions: [20, 50, 100],
              alwaysVisible: true,
            }}
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "agents", () => refetch(), "discovery:read")}
            emptyState={
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No discovery agents found.
                </p>
              </div>
            }
          />
        </CardContent>
      </TableCard>

      <HeldCandidates
        rows={held}
        total={heldTotal}
        loading={heldLoading}
        failure={heldFailure?.message}
        onRetry={heldFailure ? () => refetchHeld() : undefined}
      />
    </ConsolePage>
  );
}

function HeldCandidates({
  rows,
  total,
  loading,
  failure,
  onRetry,
}: {
  rows: DiscoveryCandidateRow[];
  total: number;
  loading: boolean;
  failure?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Seen, not classified as agents</h2>
          <p className="text-xs text-muted-foreground">
            Recorded from the cluster and the host, then held because the filter did not see an agent framework.
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{total} held</span>
      </div>
      {failure ? (
        <div className="px-4 pb-4 text-sm">
          <p>{failure}</p>
          {onRetry ? (
            <button type="button" className="mt-2 text-xs underline" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Loading candidates…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No held candidates in this workspace.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-t text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
                <th className="px-4 py-2 font-medium">Why</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2">{row.display_name || "Unnamed"}</td>
                  <td className="px-4 py-2 text-xs">{row.kind || "—"}</td>
                  <td className="px-4 py-2 text-xs">{row.confidence || "—"}</td>
                  <td className="max-w-md px-4 py-2 text-xs text-muted-foreground">
                    {(row.reasons ?? []).join(" ")}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.source}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{relativeTime(row.observed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
