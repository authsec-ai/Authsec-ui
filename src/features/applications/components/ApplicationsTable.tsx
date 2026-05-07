import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Application, Readiness, ReadinessArea, ReadinessState } from "../types";
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

function StatusStack({ readiness }: { readiness: Readiness }) {
  const items = [
    { label: "Protection", area: readiness.protection },
    { label: "Tools", area: readiness.tools },
    { label: "Access", area: readiness.access },
    { label: "Launch", area: readiness.launch },
  ];

  return (
    <div className="grid min-w-0 grid-cols-2 gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <StatePill area={item.area} />
        </div>
      ))}
    </div>
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
      approxWidth: 420,
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
      id: "status",
      header: "Status",
      accessorFn: (row) => row.readiness.launch.status,
      priority: 1,
      enableSorting: false,
      approxWidth: 380,
      cell: ({ row }) => <StatusStack readiness={row.original.readiness} />,
    },
    {
      id: "next",
      header: "Next action",
      alwaysVisible: true,
      enableSorting: false,
      approxWidth: 210,
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
      enableResizing={false}
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
