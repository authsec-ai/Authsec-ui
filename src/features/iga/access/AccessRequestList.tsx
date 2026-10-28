/**
 * AccessRequestList — list page for IGA access requests (Batch 10, U32).
 *
 * ConsolePage + AdaptiveTable + ConsoleFilterBar pattern matching
 * PolicyList and DiscoveredAgentsPage.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  useListIgaAccessRequestsQuery,
  type AccessRequest,
  type AccessRequestState,
} from "@/app/api/igaAccessApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Filter = "all" | AccessRequestState;

function stateTone(s: AccessRequestState): ConsoleTone {
  switch (s) {
    case "pending":
      return "warning";
    case "approved":
      return "success";
    case "denied":
      return "danger";
    case "cancelled":
      return "neutral";
    case "expired":
      return "neutral";
    default:
      return "neutral";
  }
}

const STATE_LABELS: Record<AccessRequestState, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  expired: "Expired",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AccessRequestListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: requests = [], isLoading, error, refetch } = useListIgaAccessRequestsQuery();

  const items = useMemo(() => {
    let rows = requests;
    if (filter !== "all") {
      rows = rows.filter((r) => r.state === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.requester_id.toLowerCase().includes(q) ||
          r.resource_id.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [requests, filter, search]);

  // Summary counts
  const total = requests.length;
  const pending = requests.filter((r) => r.state === "pending").length;
  const approved = requests.filter((r) => r.state === "approved").length;
  const denied = requests.filter((r) => r.state === "denied").length;

  const columns = useMemo<AdaptiveColumn<AccessRequest>[]>(
    () => [
      {
        id: "requester",
        header: "Requester",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.requester_id}
            detail={row.original.subject_id !== row.original.requester_id ? `for ${row.original.subject_id}` : undefined}
          />
        ),
      },
      {
        id: "resource",
        header: "Resource",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => (
          <span className="text-sm text-(--color-text)">
            {row.original.resource_id}
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.action}
          </span>
        ),
      },
      {
        id: "state",
        header: "State",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge tone={stateTone(row.original.state)}>
            {STATE_LABELS[row.original.state] ?? row.original.state}
          </StatusBadge>
        ),
      },
      {
        id: "created_at",
        header: "Created",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(row.original.created_at)}
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
    ],
    [],
  );

  return (
    <ConsolePage
      title="Access Requests"
      description="View, create, and manage access requests for resources."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/iga/access-requests/inbox")}
        >
          <Plus className="size-4" />
          New Request
        </Button>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: total },
          { label: "Pending", value: pending },
          { label: "Approved", value: approved },
          { label: "Denied", value: denied },
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
        searchPlaceholder="Search by requester, resource, or action..."
        filters={[
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "denied", label: "Denied" },
          { key: "cancelled", label: "Cancelled" },
          { key: "expired", label: "Expired" },
        ]}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="iga-access-requests"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(r) => navigate(`/iga/access-requests/${r.id}`)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "access requests", () => refetch(), "iga:access:read")}
            emptyState={
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No access requests yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate("/iga/access-requests/inbox")}
                >
                  View approval inbox
                </Button>
              </div>
            }
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
