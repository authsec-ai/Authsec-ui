import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Plug, Plus, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useListConnectorsQuery,
  useListConnectorProvidersQuery,
  useUpdateConnectorMutation,
  useDeleteConnectorMutation,
  type Connector,
} from "@/app/api/connectorsApi";
import { ConnectorBadge } from "./ConnectorBadge";
import { AddConnectorDialog } from "./AddConnectorDialog";
import { ConnectorDrawer } from "./ConnectorDrawer";

type StatusFilter = "all" | "enabled" | "disabled";

const FILTER_DEFS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "enabled", label: "Enabled" },
  { key: "disabled", label: "Disabled" },
];

function applyStatusFilter(items: Connector[], filter: StatusFilter): Connector[] {
  if (filter === "enabled") return items.filter((c) => c.enabled);
  if (filter === "disabled") return items.filter((c) => !c.enabled);
  return items;
}

export default function ConnectorsPage() {
  const { data, isLoading, refetch } = useListConnectorsQuery();
  const { data: providers } = useListConnectorProvidersQuery();
  const [updateConnector] = useUpdateConnectorMutation();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);

  const providerName = (key: string) => providers?.find((p) => p.key === key)?.display_name ?? key;

  const items = useMemo(() => {
    let list = applyStatusFilter(data ?? [], statusFilter);
    if (providerFilter !== "all") {
      list = list.filter((c) => c.provider_key === providerFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        [c.name, c.provider_key, providerName(c.provider_key)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
    // `providerName` is a new function identity every render, so it can't be
    // listed here without recomputing on every render regardless of whether
    // anything changed. `providers` (its actual dependency) is already
    // listed below — don't "fix" this by adding providerName itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, statusFilter, providerFilter, query, providers]);

  const filtersWithCounts = useMemo<ConsoleFilterOption[]>(
    () =>
      FILTER_DEFS.map((f) => ({
        ...f,
        count:
          f.key === "all"
            ? (data ?? []).length
            : applyStatusFilter(data ?? [], f.key as StatusFilter).length,
      })),
    [data],
  );

  const columns = useMemo<AdaptiveColumn<Connector>[]>(
    () => [
      {
        id: "name",
        header: "Connector",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <ConnectorBadge providerKey={row.original.provider_key} />
            <EntityCell label={row.original.name} detail={providerName(row.original.provider_key)} />
          </div>
        ),
      },
      {
        // Only Enabled/Disabled — a real connection-health pill (connected /
        // expiring / error / expired) needs GET /authsec/connectors/:id per
        // row, since the list endpoint doesn't return `connections`. That
        // N+1 cost isn't worth it for a list view; full health lives in the
        // drawer's Overview tab where the detail call already happens.
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => (
          <span
            className={
              row.original.enabled
                ? "inline-flex items-center gap-1.5 rounded-full bg-(--color-success-soft) px-2 py-0.5 text-[11px] font-medium text-(--color-success-text)"
                : "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            }
          >
            <span className="size-1.5 rounded-full bg-current" />
            {row.original.enabled ? "Enabled" : "Disabled"}
          </span>
        ),
      },
      {
        id: "agent_accessible",
        header: "Agent access",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={row.original.agent_accessible}
              onCheckedChange={(v) =>
                void updateConnector({ id: row.original.id, agent_accessible: v })
                  .unwrap()
                  .catch(() => toast.error("Couldn't update connector."))
              }
            />
          </div>
        ),
      },
      {
        id: "created_at",
        header: "Created",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ConsoleRowActions
              items={[
                { label: "View details", icon: <Plug className="size-4" />, onSelect: () => setSelectedId(row.original.id) },
                {
                  label: "Delete",
                  icon: <Trash2 className="size-4" />,
                  destructive: true,
                  onSelect: () => setDeleteTarget(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    // Same rationale as `items` above: `providerName` closes over `providers`,
    // which is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providers, updateConnector],
  );

  return (
    <ConsolePage
      title="Connectors"
      description="Let your agents act in external apps — Slack, GitHub, Google — without ever holding the credentials."
      actions={
        <Button onClick={() => setAddOpen(true)} className="text-[length:var(--text-sm)] text-white">
          <Plus className="mr-1.5 size-3.5" />
          Add connector
        </Button>
      }
    >
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search connectors"
        filters={filtersWithCounts}
        activeFilter={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as StatusFilter)}
        trailing={
          <div className="w-44">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers?.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading connectors…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <Plug className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {query || statusFilter !== "all" || providerFilter !== "all"
                  ? "No connectors match this filter."
                  : "No connectors yet"}
              </p>
              {!query && statusFilter === "all" && providerFilter === "all" && (
                <>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Connect an integration to get started.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button
                      size="sm"
                      onClick={() => setAddOpen(true)}
                      className="text-[length:var(--text-sm)] text-white"
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Add connector
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="connectors-inventory"
              data={items}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(c) => c.id}
              onRowClick={(c) => setSelectedId(c.id)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <AddConnectorDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => void refetch()} />

      <ConnectorDrawer
        connectorId={selectedId}
        onClose={() => setSelectedId(null)}
        onDeleted={() => void refetch()}
      />

      {deleteTarget && (
        <DeleteConnectorConfirm
          connector={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            void refetch();
          }}
        />
      )}
    </ConsolePage>
  );
}

// Row-menu "Delete" reuses the drawer's confirm copy but doesn't require
// opening the drawer first — a thin dialog scoped to this file.
function DeleteConnectorConfirm({
  connector,
  onClose,
  onDeleted,
}: {
  connector: Connector;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleteConnector, { isLoading }] = useDeleteConnectorMutation();

  const submit = async () => {
    try {
      await deleteConnector(connector.id).unwrap();
      toast.success("Connector deleted.");
      onDeleted();
    } catch {
      toast.error("Couldn't delete connector.");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete connector?</DialogTitle>
          <DialogDescription>
            This removes {connector.name} and its stored credentials. Any agent using it will stop
            working. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={isLoading}>
            <Trash2 className="mr-1.5 size-3.5" />
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
