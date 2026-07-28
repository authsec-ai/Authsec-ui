/**
 * Discovery → Integrations
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). Lists the configured
 * discovery channels (`discovery_sources`). Named "Integrations" because
 * "Connectors" is the existing outbound action broker and is already taken.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import {
  SOURCE_CADENCE,
  SOURCE_LABELS,
  useDiscoverySourcesWithFallback,
  type DiscoverySource,
} from "@/app/api/discoveryApi";

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
  const status = source.last_status ?? "never_run";
  const styles: Record<string, string> = {
    ok: "bg-(--color-success-soft) text-(--color-success-text)",
    degraded: "bg-(--color-warning-soft) text-(--color-warning-text)",
    failed: "bg-(--color-danger-soft) text-(--color-danger-text)",
    never_run: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    ok: "Healthy",
    degraded: "Degraded",
    failed: "Failed",
    never_run: "Never run",
  };
  return (
    <span className={`${PILL} ${styles[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}

export default function DiscoveryIntegrationsPage() {
  const { data, isLoading, usingMock } = useDiscoverySourcesWithFallback();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const items = useMemo(() => {
    let list = data;
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
  }, [data, search, statusFilter]);

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
        id: "last_error",
        header: "Detail",
        priority: 4,
        approxWidth: 300,
        cell: ({ row }) =>
          row.original.last_error ? (
            <span className="text-xs text-muted-foreground" title={row.original.last_error}>
              {row.original.last_error}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Integrations"
      description="Discovery channels that feed the agent inventory. Each environment gets an event-driven listener and a periodic scan; both write to the same inventory."
      actions={
        <Button className="text-[length:var(--text-sm)] text-white">Add integration</Button>
      }
    >
      {usingMock ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Prototype data.</strong>{" "}
          <code>/authsec/discovery/sources</code> is not implemented — these rows are fixtures
          from <code>discoveryApi.ts</code>.
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
            loading={isLoading}
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
