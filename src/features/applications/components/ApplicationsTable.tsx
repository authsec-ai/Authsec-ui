/**
 * `ApplicationsTable` — the MCP list card: status pills + search in the card
 * header, then one row per MCP. No overflow menu: a row that needs setup
 * shows a "Finish setup" button; every other row shows nothing and opens the
 * MCP on click (delete and the setup sub-pages live on the MCP page).
 *
 * Per-row columns that the list endpoint doesn't carry (identity provider,
 * tools with a permission, agents) are read per row from the same endpoints
 * the MCP page uses, so RTK Query shares the cache between the two.
 */

import { useMemo, type ReactNode } from "react";
import { Search } from "lucide-react";

import { useGetActivationPreviewQuery } from "@/app/api/setupWizardApi";
import { useListConnectionsQuery } from "@/app/api/agentIdentityApi";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";

import type { Application } from "../types";
import {
  isAgentConnection,
  mcpStatusBadgeClass,
  useMcpIdentityProviderLabel,
  type McpStatus,
} from "../lib/mcpSignals";

export type McpStatusFilter = "all" | "enforcing" | "setup";

export interface ApplicationTableRow {
  application: Application;
  status: McpStatus;
  /** Where "Finish setup" continues — the first unfinished setup step. */
  setupHref: string;
}

const MUTED = "text-[length:13.5px] text-(--color-text-muted)";

function IdentityProviderCell({ applicationId }: { applicationId: string }) {
  const { label, title } = useMcpIdentityProviderLabel(applicationId);
  return (
    <span className="text-[length:13.5px] text-(--color-text)" title={title}>
      {label ?? "—"}
    </span>
  );
}

function ToolsWithPermissionCell({ application }: { application: Application }) {
  const { data, isError } = useGetActivationPreviewQuery(application.id);
  if (data) {
    return (
      <span className="text-[length:13.5px] tabular-nums text-(--color-text)">
        {data.tools.mapped} of {data.tools.total}
      </span>
    );
  }
  // Preview unavailable (e.g. before the first tool scan): show what the list knows.
  if (isError && typeof application.tools_count === "number") {
    return (
      <span className={MUTED} title="Permission mapping isn't available yet">
        — of {application.tools_count}
      </span>
    );
  }
  return <span className={MUTED}>—</span>;
}

function AgentsCell({ applicationId }: { applicationId: string }) {
  const { data } = useListConnectionsQuery(applicationId);
  if (!data) return <span className={MUTED}>—</span>;
  const count = data.items.filter(isAgentConnection).length;
  return <span className="text-[length:13.5px] tabular-nums text-(--color-text)">{count}</span>;
}

function FilterPills({
  value,
  onChange,
  options,
}: {
  value: McpStatusFilter;
  onChange: (value: McpStatusFilter) => void;
  options: Array<{ key: McpStatusFilter; label: string; count: number }>;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="inline-flex items-center gap-0.5 rounded-lg bg-(--color-surface-subtle) p-1"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[length:13.5px] transition-colors",
              active
                ? "bg-(--color-surface-raised) font-semibold text-(--color-text) shadow-(--shadow-pill)"
                : "font-medium text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {o.label}
            <span className="tabular-nums text-(--color-text-muted)">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ApplicationsTable({
  rows,
  counts,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onOpenApplication,
  onFinishSetup,
  emptyState,
}: {
  rows: ApplicationTableRow[];
  counts: Record<McpStatusFilter, number>;
  filter: McpStatusFilter;
  onFilterChange: (value: McpStatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenApplication: (application: Application) => void;
  onFinishSetup: (row: ApplicationTableRow) => void;
  /** Rendered in place of the table when there are no rows to show. */
  emptyState?: ReactNode;
}) {
  const columns = useMemo<AdaptiveColumn<ApplicationTableRow>[]>(
    () => [
      {
        id: "mcp",
        header: "MCP",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => {
          const a = row.original.application;
          return (
            <div className="min-w-0">
              <div className="truncate text-[length:14px] font-semibold text-(--color-text)" title={a.name}>
                {a.name}
              </div>
              {a.resource_uri ? (
                <div
                  className="mt-0.5 truncate font-mono text-[length:12.5px] text-(--color-text-muted)"
                  title={a.resource_uri}
                >
                  {a.resource_uri}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className={mcpStatusBadgeClass(row.original.status)}>
            <span className="bdot" />
            {row.original.status.label}
          </span>
        ),
      },
      {
        id: "idp",
        header: "Identity provider",
        priority: 2,
        approxWidth: 170,
        cell: ({ row }) => <IdentityProviderCell applicationId={row.original.application.id} />,
      },
      {
        id: "tools",
        header: "Tools with a permission",
        priority: 3,
        approxWidth: 170,
        cell: ({ row }) => <ToolsWithPermissionCell application={row.original.application} />,
      },
      {
        id: "agents",
        header: "Agents",
        priority: 4,
        approxWidth: 90,
        cell: ({ row }) => <AgentsCell applicationId={row.original.application.id} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 130,
        enableHiding: false,
        cell: ({ row }) =>
          row.original.status.enforcing ? null : (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" className="text-white" onClick={() => onFinishSetup(row.original)}>
                Finish setup
              </Button>
            </div>
          ),
      },
    ],
    [onFinishSetup],
  );

  return (
    <TableCard>
      <div className="flex flex-col gap-3 border-b border-(--color-border-subtle) px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          value={filter}
          onChange={onFilterChange}
          options={[
            { key: "all", label: "All", count: counts.all },
            { key: "enforcing", label: "Enforcing", count: counts.enforcing },
            { key: "setup", label: "Needs setup", count: counts.setup },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            aria-label="Search MCPs"
            className="h-9 pl-9"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <CardContent variant="flush">
        {emptyState ?? (
          <AdaptiveTable
            tableId="applications"
            data={rows}
            columns={columns}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(row) => onOpenApplication(row.application)}
            getRowId={(row) => row.application.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: rows.length > 20 }}
          />
        )}
      </CardContent>
    </TableCard>
  );
}
