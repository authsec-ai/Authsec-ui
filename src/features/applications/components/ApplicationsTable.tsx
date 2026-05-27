import { useMemo } from "react";
import {
  Activity,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  PlayCircle,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { TableCard } from "@/theme/components/cards";
import type { Application } from "../types";
import type { computeReadiness } from "../lib/computeReadiness";
import {
  StatusBadge,
  toneFromReadiness,
} from "./ApplicationConsole";

export interface ApplicationTableRow {
  application: Application;
  readiness: ReturnType<typeof computeReadiness>;
  next: {
    label: string;
    href: string;
    primary: boolean;
  };
}

function readinessCopy(row: ApplicationTableRow) {
  if (row.readiness.launch.state === "ok") return "Ready to launch";
  if (row.readiness.protection.state !== "ok") return "Protection not verified";
  if (row.readiness.tools.state !== "ok") return "Tools need review";
  if (row.readiness.access.state !== "ok") return "Access needs setup";
  return row.readiness.launch.status;
}

function riskTone(row: ApplicationTableRow): "danger" | "warning" | "success" | "neutral" {
  if (row.readiness.launch.state === "err" || row.readiness.tools.state === "err") {
    return "danger";
  }
  if (row.readiness.tools.state === "warn" || row.readiness.launch.state === "warn") {
    return "warning";
  }
  if (row.readiness.launch.state === "ok") return "success";
  return "neutral";
}

function lastSignal(application: Application) {
  if (application.last_scan_completed_at) {
    return `Manifest ${new Date(application.last_scan_completed_at).toLocaleDateString()}`;
  }
  if (application.last_validated_at) {
    return `Checked ${new Date(application.last_validated_at).toLocaleDateString()}`;
  }
  return "No runtime signal";
}

const ROW_ACTIONS: Array<{
  key: string;
  label: string;
  tab: string;
  icon: typeof ShieldCheck;
}> = [
  { key: "overview", label: "Open overview", tab: "overview", icon: ExternalLink },
  { key: "setup", label: "Setup", tab: "setup", icon: ShieldCheck },
  { key: "tools", label: "Review tools", tab: "tools", icon: Wrench },
  { key: "access", label: "Manage access", tab: "access", icon: KeyRound },
  { key: "clients", label: "Clients", tab: "clients", icon: Users },
  { key: "test", label: "Run test login", tab: "test", icon: PlayCircle },
  { key: "activity", label: "Monitor", tab: "activity", icon: Activity },
];

export function ApplicationsTable({
  rows,
  onOpenApplication,
  onNavigateToTab,
  onDeleteApplication,
}: {
  rows: ApplicationTableRow[];
  onOpenApplication: (application: Application) => void;
  onNavigateToTab: (applicationId: string, tab: string) => void;
  onDeleteApplication: (application: Application) => void;
}) {
  const columns = useMemo<AdaptiveColumn<ApplicationTableRow>[]>(
    () => [
      {
        id: "application",
        header: "Application",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">
              {row.original.application.name}
            </div>
            <div className="mt-1 truncate font-mono text-[12px] text-slate-500">
              {row.original.application.resource_uri}
            </div>
          </div>
        ),
      },
      {
        id: "readiness",
        header: "Readiness",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => (
          <StatusBadge tone={toneFromReadiness(row.original.readiness.launch.state)}>
            {readinessCopy(row.original)}
          </StatusBadge>
        ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => {
          const tone = riskTone(row.original);
          return (
            <StatusBadge tone={tone}>
              {tone === "danger" ? "High" : tone === "warning" ? "Needs review" : "Low"}
            </StatusBadge>
          );
        },
      },
      {
        id: "users",
        header: "Users",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-sm text-slate-700">
            {row.original.application.end_users_count ?? 0}
          </span>
        ),
      },
      {
        id: "lastSignal",
        header: "Last signal",
        priority: 4,
        approxWidth: 190,
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">{lastSignal(row.original.application)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 72,
        enableHiding: false,
        cell: ({ row }) => (
          <ApplicationActions
            row={row.original}
            onNavigateToTab={onNavigateToTab}
            onDeleteApplication={onDeleteApplication}
          />
        ),
      },
    ],
    [onDeleteApplication, onNavigateToTab],
  );

  return (
    <TableCard>
      <CardContent variant="flush">
        <AdaptiveTable
          tableId="applications"
          data={rows}
          columns={columns}
          enableSelection={false}
          enableExpansion={false}
          onRowClick={(row) => onOpenApplication(row.application)}
          getRowId={(row) => row.application.id}
          pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: rows.length > 10 }}
        />
      </CardContent>
    </TableCard>
  );
}

function ApplicationActions({
  row,
  onNavigateToTab,
  onDeleteApplication,
}: {
  row: ApplicationTableRow;
  onNavigateToTab: (applicationId: string, tab: string) => void;
  onDeleteApplication: (application: Application) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${row.application.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel className="max-w-48 truncate text-slate-500">
          {row.application.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROW_ACTIONS.map(({ key, label, tab, icon: Icon }) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onNavigateToTab(row.application.id, tab)}
          >
            <Icon className="size-4 text-slate-500" />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDeleteApplication(row.application)}
        >
          <Trash2 className="size-4" />
          Delete application
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
