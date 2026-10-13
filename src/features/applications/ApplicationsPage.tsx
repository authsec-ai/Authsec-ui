/**
 * `ApplicationsPage` — triage list for protected MCP servers / APIs.
 * Rebuilt to match the Console Refresh prototype (section-header, triage
 * banner, metric strip, bespoke table), wired to real data + mutations.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ExternalLink,
  KeyRound,
  PlayCircle,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";

import { DeleteApplicationDialog } from "./components/DeleteApplicationDialog";
import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import type { Application } from "./types";
import type { ReadinessState } from "./types";

type ConsoleTone = "success" | "warning" | "danger" | "info" | "muted";

interface AppRow {
  application: Application;
  readiness: ReturnType<typeof computeReadiness>;
}

interface BucketCounts {
  total: number;
  active: number;
  inSetup: number;
  blocked: number;
}

function bucketRow(row: AppRow): keyof BucketCounts {
  if (isLaunched(row.application)) return "active";
  if (
    row.application.state === "scan_failed" ||
    row.readiness.protection.state === "err" ||
    row.readiness.launch.state === "err"
  ) {
    return "blocked";
  }
  return "inSetup";
}

function toneFromState(state: ReadinessState): ConsoleTone {
  if (state === "ok") return "success";
  if (state === "warn") return "warning";
  if (state === "err") return "danger";
  return "muted";
}

function readinessCopy(row: AppRow): string {
  const r = row.readiness;
  if (isLaunched(row.application)) return "Launched";
  if (r.launch.state === "ok") return "Ready to launch";
  if (r.protection.state === "err") return "Blocked";
  if (r.protection.state !== "ok") return "In setup";
  if (r.tools.state !== "ok") return "Tools need review";
  if (r.access.state !== "ok") return "Access needs setup";
  return r.launch.status;
}

function riskOf(row: AppRow): { tone: ConsoleTone; label: string } {
  const r = row.readiness;
  if (r.launch.state === "err" || r.tools.state === "err" || row.application.state === "scan_failed")
    return { tone: "danger", label: "High" };
  if (r.tools.state === "warn" || r.launch.state === "warn" || r.protection.state === "warn")
    return { tone: "warning", label: "Needs review" };
  return { tone: "muted", label: "Low" };
}

function lastSignal(application: Application): string {
  if (application.last_scan_completed_at)
    return `Manifest · ${new Date(application.last_scan_completed_at).toLocaleDateString()}`;
  if (application.last_validated_at)
    return `Checked · ${new Date(application.last_validated_at).toLocaleDateString()}`;
  return "No runtime signal";
}

const ROW_ACTIONS: Array<{ label: string; tab: string; icon: typeof ShieldCheck }> = [
  { label: "Open overview", tab: "overview", icon: ExternalLink },
  { label: "Setup", tab: "setup", icon: ShieldCheck },
  { label: "Review tools", tab: "tools", icon: Wrench },
  { label: "Manage access", tab: "access-assignments", icon: KeyRound },
  { label: "Clients", tab: "clients", icon: Users },
  { label: "Run test login", tab: "test", icon: PlayCircle },
];

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { data: applications, isLoading } = useListApplicationsQuery();

  const [query, setQuery] = useState("");

  const rows: AppRow[] = useMemo(
    () => (applications ?? []).map((application) => ({ application, readiness: computeReadiness(application) })),
    [applications],
  );

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (row) =>
        row.application.name.toLowerCase().includes(q) ||
        (row.application.resource_uri ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const [pendingDelete, setPendingDelete] = useState<Application | null>(null);

  const columns = useMemo<AdaptiveColumn<AppRow>[]>(
    () => [
      {
        id: "application",
        header: "Application",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => {
          const a = row.original.application;
          const tone = toneFromState(row.original.readiness.launch.state);
          const glyphTone = bucketRow(row.original) === "blocked" ? "danger" : tone;
          return (
            <div className="app-cell">
              <span className={`app-glyph tone-${glyphTone}`}>
                {glyphTone === "danger" ? <ShieldAlert className="icon" /> : <Server className="icon" />}
              </span>
              <EntityCell label={a.name} detail={a.resource_uri} />
            </div>
          );
        },
      },
      {
        id: "readiness",
        header: "Readiness",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => {
          const tone = toneFromState(row.original.readiness.launch.state);
          return (
            <span className={`badge badge--${tone}`}>
              <span className="bdot" />
              {readinessCopy(row.original)}
            </span>
          );
        },
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => {
          const risk = riskOf(row.original);
          return (
            <span className={`badge badge--${risk.tone}`}>
              <span className="bdot" />
              {risk.label}
            </span>
          );
        },
      },
      {
        id: "users",
        header: "Users",
        priority: 3,
        approxWidth: 80,
        cell: ({ row }) => {
          const users = row.original.application.end_users_count ?? 0;
          return (
            <span className={`num-cell${users === 0 ? " zero" : ""}`}>{users}</span>
          );
        },
      },
      {
        id: "lastSignal",
        header: "Last signal",
        priority: 4,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="signal-cell">{lastSignal(row.original.application)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const a = row.original.application;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                label={`Actions for ${a.name}`}
                items={[
                  ...ROW_ACTIONS.map(({ label, tab, icon: Icon }) => ({
                    label,
                    icon: <Icon className="size-4" />,
                    onSelect: () => navigate(`/applications/${a.id}/${tab}`),
                  })),
                  {
                    label: "Delete application",
                    icon: <Trash2 className="size-4" />,
                    destructive: true,
                    onSelect: () => setPendingDelete(a),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <ConsolePage
      title="Applications"
      description="Triage protected MCP servers, APIs, and services by launch readiness and runtime risk."
      actions={
        <Button className="text-white" onClick={() => navigate("/applications/new")}>
          <Plus className="icon-sm" /> Create application
        </Button>
      }
    >

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search applications…"
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Server className="icon-lg" />
              </span>
              <h3 className="empty-title">No applications yet</h3>
              <p className="empty-desc">
                Register a protected MCP server or API and AuthSec will guide protection, tool review,
                access, and launch.
              </p>
              <Button className="text-white" onClick={() => navigate("/applications/new")}>
                <Plus className="icon-sm" /> Create the first application
              </Button>
            </div>
          ) : (
            <AdaptiveTable
              tableId="applications"
              data={filteredRows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.application.id}
              onRowClick={(row) => navigate(`/applications/${row.application.id}/overview`)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <DeleteApplicationDialog
        application={pendingDelete}
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </ConsolePage>
  );
}

