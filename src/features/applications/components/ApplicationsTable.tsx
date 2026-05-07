import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function ApplicationsTable({
  rows,
  onOpenApplication,
}: {
  rows: ApplicationTableRow[];
  onOpenApplication: (application: Application) => void;
}) {
  return (
    <Surface className="overflow-hidden p-0">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[32%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
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
              Next action
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.application.id}
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
                <Button
                  asChild
                  size="sm"
                  variant={row.next.primary ? "default" : "outline"}
                  className="h-9"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Link to={row.next.href}>
                    {row.next.label}
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}
