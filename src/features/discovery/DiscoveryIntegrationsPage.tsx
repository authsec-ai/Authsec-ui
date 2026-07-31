/**
 * Discovery → Integrations
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). Lists the configured
 * discovery channels (`discovery_sources`). Named "Integrations" because
 * "Connectors" is the existing outbound action broker and is already taken.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  type ConsoleActionItem,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SOURCE_CADENCE,
  SOURCE_LABELS,
  useDeleteDiscoverySourceMutation,
  useListDiscoverySourcesQuery,
  useUpdateDiscoverySourceMutation,
  type DiscoverySource,
} from "@/app/api/discoveryApi";
import { AddIntegrationDialog } from "./AddIntegrationDialog";
import { DeployCollectorWizard } from "./DeployCollectorWizard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StatusFilter = "all" | "enabled" | "disabled" | "attention";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "enabled", label: "Enabled" },
  { key: "disabled", label: "Disabled" },
  { key: "attention", label: "Needs attention" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

function StatusPill({ source }: { source: DiscoverySource }) {
  if (!source.enabled) {
    return (
      <span className={`${PILL} bg-muted text-muted-foreground`}>
        <span className="size-1.5 rounded-full bg-current" />
        Disabled
      </span>
    );
  }
  // last_status is free text from the connector, not an enum — map what we know
  // and fall through to showing the raw value rather than inventing a state.
  const raw = source.last_status?.trim() ?? "";
  const known: Record<string, { cls: string; label: string }> = {
    "": { cls: "bg-muted text-muted-foreground", label: "Never run" },
    ok: { cls: "bg-(--color-success-soft) text-(--color-success-text)", label: "Healthy" },
    success: { cls: "bg-(--color-success-soft) text-(--color-success-text)", label: "Healthy" },
    degraded: { cls: "bg-(--color-warning-soft) text-(--color-warning-text)", label: "Degraded" },
    partial: { cls: "bg-(--color-warning-soft) text-(--color-warning-text)", label: "Partial" },
    failed: { cls: "bg-(--color-danger-soft) text-(--color-danger-text)", label: "Failed" },
    error: { cls: "bg-(--color-danger-soft) text-(--color-danger-text)", label: "Failed" },
  };
  const m = known[raw.toLowerCase()] ?? {
    cls: "bg-muted text-muted-foreground",
    label: raw,
  };
  return (
    <span className={`${PILL} ${m.cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

export default function DiscoveryIntegrationsPage() {
  const { data, isError, error, refetch } = useListDiscoverySourcesQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoverySource | null>(null);
  const [updateSource] = useUpdateDiscoverySourceMutation();
  const [deleteSource, { isLoading: deleting }] = useDeleteDiscoverySourceMutation();

  const permissionError = (err: unknown, fallback: string) =>
    toast.error(
      (err as { status?: number })?.status === 403
        ? "Your role is missing the discovery:admin permission."
        : fallback,
    );

  const allSources = useMemo(() => data ?? [], [data]);

  const items = useMemo(() => {
    let list = allSources;
    if (statusFilter === "enabled") list = list.filter((s) => s.enabled);
    if (statusFilter === "disabled") list = list.filter((s) => !s.enabled);
    if (statusFilter === "attention") {
      list = list.filter(
        (s) => s.enabled && (s.last_status === "failed" || s.last_status === "degraded"),
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.display_name, SOURCE_LABELS[s.kind], s.kind].join(" ").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allSources, search, statusFilter]);

  const columns = useMemo<AdaptiveColumn<DiscoverySource>[]>(
    () => [
      {
        id: "name",
        header: "Integration",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name}
            detail={SOURCE_LABELS[row.original.kind]}
          />
        ),
      },
      {
        id: "cadence",
        header: "Cadence",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {SOURCE_CADENCE[row.original.kind]}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => <StatusPill source={row.original} />,
      },
      {
        id: "last_sync_at",
        header: "Last sync",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.last_sync_at
              ? formatDistanceToNow(new Date(row.original.last_sync_at), { addSuffix: true })
              : "Never"}
          </span>
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={row.original.enabled}
              onCheckedChange={(v) =>
                void updateSource({ id: row.original.id, enabled: v })
                  .unwrap()
                  .catch((e) => permissionError(e, "Could not update the integration."))
              }
            />
          </div>
        ),
      },
      {
        id: "last_error",
        header: "Detail",
        priority: 4,
        approxWidth: 240,
        cell: ({ row }) =>
          row.original.last_error ? (
            <span
              className="block max-w-[220px] truncate text-xs text-muted-foreground"
              title={row.original.last_error}
            >
              {row.original.last_error}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const actions: ConsoleActionItem[] = [
            { label: "View details", onSelect: () => navigate(`/iga/integrations/${row.original.id}`) },
            {
              label: row.original.enabled ? "Disable" : "Enable",
              onSelect: () =>
                void updateSource({ id: row.original.id, enabled: !row.original.enabled })
                  .unwrap()
                  .catch((e) => permissionError(e, "Could not update the integration.")),
            },
            {
              label: "Delete…",
              destructive: true,
              onSelect: () => setDeleteTarget(row.original),
            },
          ];
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions items={actions} />
            </div>
          );
        },
      },
    ],
    // updateSource/navigate are stable; permissionError closes over nothing mutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ConsolePage
      title="Integrations"
      description="Discovery channels that feed the agent inventory. Each environment gets an event-driven listener and a periodic scan; both write to the same inventory."
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="text-[length:var(--text-sm)] text-white">Add integration</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
              Kubernetes — deploy collector
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAddOpen(true)}>
              Cloud, VM or repository — connect credential
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load integrations.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search integrations…"
        filters={FILTERS}
        activeFilter={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as StatusFilter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="discovery-integrations"
            columns={columns}
            data={items}
            getRowId={(s) => s.id}
            onRowClick={(s) => navigate(`/iga/integrations/${s.id}`)}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <DeployCollectorWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => void refetch()}
      />

      <AddIntegrationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => void refetch()}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete integration</DialogTitle>
            <DialogDescription>
              Removes <strong>{deleteTarget?.display_name}</strong> and stops it producing
              sightings. Agents it already discovered stay in the inventory — the FK is{" "}
              <code>ON DELETE SET NULL</code>, so they outlive their source rather than
              disappearing with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!deleteTarget) return;
                void deleteSource(deleteTarget.id)
                  .unwrap()
                  .then(() => {
                    toast.success(`${deleteTarget.display_name} deleted.`);
                    setDeleteTarget(null);
                    void refetch();
                  })
                  .catch((e) => permissionError(e, "Could not delete the integration."));
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
