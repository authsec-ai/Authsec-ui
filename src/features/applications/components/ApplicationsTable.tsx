import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Application, ReadinessArea, ReadinessState } from "../types";
import type { computeReadiness } from "../lib/computeReadiness";

export interface ApplicationTableRow {
  application: Application;
  readiness: ReturnType<typeof computeReadiness>;
  next: {
    label: string;
    href: string;
    primary: boolean;
  };
}

const STATE_PILL: Record<
  ReadinessState,
  { dot: string; chip: string; chipText: string }
> = {
  ok: {
    dot: "bg-[var(--color-success)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)]",
    chipText: "text-[var(--color-success)]",
  },
  warn: {
    dot: "bg-[var(--color-warning)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_10%,transparent)]",
    chipText: "text-[var(--color-warning)]",
  },
  err: {
    dot: "bg-[color:color-mix(in_oklch,var(--color-danger)_85%,black)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_10%,transparent)]",
    chipText: "text-[var(--color-danger)]",
  },
  none: {
    dot: "bg-muted-foreground/40",
    chip: "border-border bg-muted",
    chipText: "text-muted-foreground",
  },
};

function StatePill({ area }: { area: ReadinessArea }) {
  const tone = STATE_PILL[area.state];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone.chip,
        tone.chipText,
      )}
      title={area.detail}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {area.status}
    </span>
  );
}

export function ApplicationsTable({
  rows,
  onOpenApplication,
}: {
  rows: ApplicationTableRow[];
  onOpenApplication: (application: Application) => void;
}) {
  const columns = React.useMemo<AdaptiveColumn<ApplicationTableRow>[]>(() => [
    {
      id: "application",
      header: "Application",
      accessorFn: (row) => row.application.name,
      alwaysVisible: true,
      enableSorting: true,
      approxWidth: 320,
      cell: ({ row }) => {
        const application = row.original.application;
        return (
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">
              {application.name}
            </div>
            {application.resource_uri && (
              <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {application.resource_uri}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      accessorFn: () => "MCP",
      priority: 4,
      enableSorting: true,
      approxWidth: 120,
      cell: () => (
        <Badge
          variant="outline"
          className="rounded-full border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          MCP
        </Badge>
      ),
    },
    {
      id: "protection",
      header: "Protection",
      accessorFn: (row) => row.readiness.protection.status,
      priority: 1,
      enableSorting: true,
      approxWidth: 180,
      cell: ({ row }) => <StatePill area={row.original.readiness.protection} />,
    },
    {
      id: "tools",
      header: "Tools",
      accessorFn: (row) => row.readiness.tools.status,
      priority: 2,
      enableSorting: true,
      approxWidth: 180,
      cell: ({ row }) => <StatePill area={row.original.readiness.tools} />,
    },
    {
      id: "access",
      header: "Access",
      accessorFn: (row) => row.readiness.access.status,
      priority: 3,
      enableSorting: true,
      approxWidth: 220,
      cell: ({ row }) => <StatePill area={row.original.readiness.access} />,
    },
    {
      id: "launch",
      header: "Launch",
      accessorFn: (row) => row.readiness.launch.status,
      priority: 5,
      enableSorting: true,
      approxWidth: 160,
      cell: ({ row }) => <StatePill area={row.original.readiness.launch} />,
    },
    {
      id: "next",
      header: "Next action",
      alwaysVisible: true,
      enableSorting: false,
      approxWidth: 190,
      className: "text-right",
      cellClassName: "text-right",
      cell: ({ row }) => {
        const { next } = row.original;
        return (
          <Button
            asChild
            size="sm"
            variant={next.primary ? "default" : "outline"}
            onClick={(event) => event.stopPropagation()}
          >
            <Link to={next.href}>
              {next.label}
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        );
      },
    },
  ], []);

  return (
    <AdaptiveTable
      tableId="applications"
      data={rows}
      columns={columns}
      enableSelection={false}
      enableExpansion={false}
      enableSorting
      enablePagination
      getRowId={(row) => row.application.id}
      onRowClick={(row) => onOpenApplication(row.application)}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [5, 10, 25, 50],
        alwaysVisible: true,
      }}
    />
  );
}
