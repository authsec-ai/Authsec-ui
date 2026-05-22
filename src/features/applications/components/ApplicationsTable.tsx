import { useState } from "react";
import {
  MoreHorizontal,
  ShieldCheck,
  Wrench,
  KeyRound,
  Users,
  PlayCircle,
  Rocket,
  Activity,
  Trash2,
  ExternalLink,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Application } from "../types";
import type { computeReadiness } from "../lib/computeReadiness";
import {
  StatusBadge,
  Surface,
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

const ROW_ACTIONS: Array<{
  key: string;
  label: string;
  tab: string;
  icon: typeof ShieldCheck;
}> = [
  { key: "overview", label: "Open overview", tab: "overview", icon: ExternalLink },
  { key: "setup", label: "Protect", tab: "setup", icon: ShieldCheck },
  { key: "tools", label: "Review tools", tab: "tools", icon: Wrench },
  { key: "access", label: "Manage access", tab: "access", icon: KeyRound },
  { key: "clients", label: "Clients", tab: "clients", icon: Users },
  { key: "test", label: "Run test login", tab: "test", icon: PlayCircle },
  { key: "launch", label: "Launch", tab: "launch", icon: Rocket },
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
  return (
    <Surface className="overflow-hidden p-0">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[42%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[20%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
            <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              Application
            </th>
            <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              Readiness
            </th>
            <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              Risk
            </th>
            <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              Last signal
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ApplicationRow
              key={row.application.id}
              row={row}
              onOpenApplication={onOpenApplication}
              onNavigateToTab={onNavigateToTab}
              onDeleteApplication={onDeleteApplication}
            />
          ))}
        </tbody>
      </table>
    </Surface>
  );
}

function ApplicationRow({
  row,
  onOpenApplication,
  onNavigateToTab,
  onDeleteApplication,
}: {
  row: ApplicationTableRow;
  onOpenApplication: (application: Application) => void;
  onNavigateToTab: (applicationId: string, tab: string) => void;
  onDeleteApplication: (application: Application) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr
      onClick={() => onOpenApplication(row.application)}
      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/80 last:border-b-0"
    >
      <td className="px-4 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950">
            {row.application.name}
          </div>
          <div className="mt-1 truncate font-mono text-[12px] text-slate-500">
            {row.application.resource_uri}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusBadge tone={toneFromReadiness(row.readiness.launch.state)}>
          {readinessCopy(row)}
        </StatusBadge>
      </td>
      <td className="px-4 py-4">
        <StatusBadge tone={riskTone(row)}>
          {riskTone(row) === "danger"
            ? "High"
            : riskTone(row) === "warning"
              ? "Needs review"
              : "Low"}
        </StatusBadge>
      </td>
      <td className="px-4 py-4 text-sm text-slate-600">
        {row.application.last_scan_completed_at
          ? `Manifest ${new Date(row.application.last_scan_completed_at).toLocaleDateString()}`
          : row.application.last_validated_at
            ? `Checked ${new Date(row.application.last_validated_at).toLocaleDateString()}`
            : "No runtime signal"}
      </td>
      <td className="px-4 py-4 text-right">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${row.application.name}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // Stop row click propagation when interacting with menu items.
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuLabel className="truncate text-slate-500">
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
      </td>
    </tr>
  );
}
