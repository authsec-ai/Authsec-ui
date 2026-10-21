import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useListWorkspaceClientsQuery, type WorkspaceClientItem } from "@/app/api/mcpClientsApi";

import { ClientDrawer } from "./ClientDrawer";
import {
  CONNECTION_STATUS,
  KIND_LABELS,
  REGISTRATION_LABELS,
  SMALL_TEXT,
  connectionStatus,
  useApproveClient,
} from "./clientStatus";

// ─── Scope ───────────────────────────────────────────────────────────────────

export type ClientsTableScope =
  | { kind: "workspace" }
  | { kind: "resource_server"; rsId: string };

interface ClientsTableProps {
  scope: ClientsTableScope;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (status: StatusFilter) => void;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type KindFilter = "all" | "agent" | "human_app" | "m2m" | "cli";
export type StatusFilter = "all" | "pending_approval" | "approved" | "revoked";

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agents" },
  { key: "human_app", label: "Human apps" },
  { key: "m2m", label: "M2M" },
  { key: "cli", label: "CLI" },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "approved", label: "Approved" },
  { key: "revoked", label: "Revoked" },
];

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoString: string | undefined): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  if (isNaN(diff)) return "—";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─── Row decision: one button, only when a decision is needed ────────────────

function ApproveButton({ client }: { client: WorkspaceClientItem }) {
  const [approve, { isLoading }] = useApproveClient();
  if (client.status !== "pending_approval") return null;
  return (
    <Button
      size="sm"
      className="text-white"
      onClick={(e) => {
        e.stopPropagation();
        void approve(client);
      }}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />}
      Approve
    </Button>
  );
}

// ─── Main table component ─────────────────────────────────────────────────────

/**
 * Workspace (or one MCP server's) client registrations, one row each. A
 * pending row carries one Approve button; deny, revoke and copy live in the
 * client drawer that a row click opens.
 */
export function ClientsTable({
  scope,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
}: ClientsTableProps) {
  const queryArg =
    scope.kind === "resource_server"
      ? { resourceServerId: scope.rsId }
      : undefined;

  const { data: clients, isLoading, isError } = useListWorkspaceClientsQuery(queryArg);

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [internalStatusFilter, setInternalStatusFilter] =
    useState<StatusFilter>("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const statusFilter = controlledStatusFilter ?? internalStatusFilter;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatusFilter;

  const kindCounts = useMemo(() => {
    const all = clients ?? [];
    return {
      all: all.length,
      agent: all.filter((c) => c.client_kind === "agent").length,
      human_app: all.filter((c) => c.client_kind === "human_app").length,
      m2m: all.filter((c) => c.client_kind === "m2m").length,
      cli: all.filter((c) => c.client_kind === "cli").length,
    };
  }, [clients]);

  const statusCounts = useMemo(() => {
    const all = clients ?? [];
    return {
      all: all.length,
      pending_approval: all.filter((c) => c.status === "pending_approval").length,
      approved: all.filter((c) => c.status === "approved").length,
      revoked: all.filter((c) => c.status === "revoked").length,
    };
  }, [clients]);

  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = (clients ?? []).filter((c) => {
      if (kindFilter !== "all" && c.client_kind !== kindFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.client_name, c.software_id, c.client_id, c.resource_server_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

    // Rows that need a decision first.
    return filtered.slice().sort((a, b) => {
      const aPending = a.status === "pending_approval" ? 0 : 1;
      const bPending = b.status === "pending_approval" ? 0 : 1;
      return aPending - bPending;
    });
  }, [clients, search, kindFilter, statusFilter]);

  const hasPending = statusCounts.pending_approval > 0;

  const columns = useMemo<AdaptiveColumn<WorkspaceClientItem>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <EntityCell
              label={<span className="font-semibold">{c.client_name || c.software_id || c.client_id}</span>}
              detail={c.client_id}
              monoDetail
            />
          );
        },
      },
      {
        id: "kind",
        header: "Kind",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => <span className="text-sm text-foreground">{KIND_LABELS[row.original.client_kind]}</span>,
      },
      {
        id: "application",
        header: "MCP server",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.resource_server_name || <span className="text-muted-foreground">–</span>}
          </span>
        ),
      },
      {
        id: "registration",
        header: "Registration",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {REGISTRATION_LABELS[row.original.registration_type] ?? row.original.registration_type}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => {
          const s = CONNECTION_STATUS[connectionStatus(row.original)];
          return (
            <StatusBadge tone={s.tone} className={SMALL_TEXT}>
              {s.label}
            </StatusBadge>
          );
        },
      },
      {
        id: "last-token",
        header: "Last used",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.last_token_issued_at ? relativeTime(row.original.last_token_issued_at) : "Never"}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        priority: 5,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{relativeTime(row.original.created_at)}</span>
        ),
      },
      ...(hasPending
        ? [
            {
              id: "actions",
              header: "",
              alwaysVisible: true,
              approxWidth: 120,
              cell: ({ row }: { row: { original: WorkspaceClientItem } }) => <ApproveButton client={row.original} />,
            } satisfies AdaptiveColumn<WorkspaceClientItem>,
          ]
        : []),
    ],
    [hasPending],
  );

  const selectedConnections = useMemo(
    () => (selectedClientId ? (clients ?? []).filter((c) => c.client_id === selectedClientId) : []),
    [clients, selectedClientId],
  );
  const selected = selectedConnections[0];

  // ─── Render ────────────────────────────────────────────────────────────────

  const isEmpty = (clients?.length ?? 0) === 0;
  const noMatch = !isEmpty && visibleClients.length === 0;

  return (
    <div className="space-y-3">
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, client ID, or MCP server"
        filters={KIND_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: kindCounts[f.key],
        }))}
        activeFilter={kindFilter}
        onFilterChange={(v) => setKindFilter(v as KindFilter)}
      />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          const count = statusCounts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-semibold transition-colors",
                SMALL_TEXT,
                active
                  ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                  : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
              )}
            >
              {f.label}
              {count > 0 ? <span className={cn("tabular-nums", !active && "text-muted-foreground")}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <TableCard>
        <CardContent variant="flush">
          {isError ? (
            <div className="py-16 text-center text-sm text-destructive">
              Couldn't load clients. Check your connection and refresh.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading clients…
            </div>
          ) : isEmpty || noMatch ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {isEmpty ? "No clients yet" : "No clients match this filter"}
              </p>
              <p className={cn("mx-auto mt-1 max-w-sm leading-5 text-muted-foreground", SMALL_TEXT)}>
                {isEmpty
                  ? "Agents and apps that connect to your MCP servers appear here after they register."
                  : "Try a different search term or filter."}
              </p>
              {search || kindFilter !== "all" || statusFilter !== "all" ? (
                <button
                  type="button"
                  className={cn("mt-4 font-semibold text-(--color-primary-text) hover:underline", SMALL_TEXT)}
                  onClick={() => {
                    setSearch("");
                    setKindFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <AdaptiveTable
              tableId={`clients-flat-${scope.kind}`}
              data={visibleClients}
              columns={columns}
              getRowId={(c) => `${c.resource_server_id}:${c.client_id}`}
              enableSelection={false}
              enableExpansion={false}
              onRowClick={(c) => setSelectedClientId(c.client_id)}
              pagination={{
                pageSize: 25,
                pageSizeOptions: [10, 25, 50, 100],
                alwaysVisible: true,
              }}
            />
          )}
        </CardContent>
      </TableCard>

      {selected ? (
        <ClientDrawer
          open
          onClose={() => setSelectedClientId(null)}
          name={selected.client_name || selected.software_id || selected.client_id}
          clientId={selected.client_id}
          connections={selectedConnections}
        />
      ) : null}
    </div>
  );
}
