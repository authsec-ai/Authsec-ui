/**
 * `ApplicationsPage` — the triage list that replaces ResourceServersPage
 * for users on the `/applications` route.
 *
 * Three things make this page distinct from a normal data table:
 *   1. The "Next action" column is the most prominent column. Each row
 *      shows the per-app NBA computed from state.
 *   2. A summary strip up top counts how many apps are Active / In setup
 *      / Blocked, so an admin sees the operational picture immediately.
 *   3. Click a row → `/applications/:id/overview` (no detail dialog).
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCcw } from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";

import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import {
  computeNextBestAction,
  nextActionHref,
} from "./lib/computeNextBestAction";
import {
  ApplicationsTable,
  type ApplicationTableRow,
} from "./components/ApplicationsTable";

type AppRow = ApplicationTableRow;

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

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const {
    data: applications,
    isLoading,
    refetch,
  } = useListApplicationsQuery();

  const rows: AppRow[] = useMemo(() => {
    return (applications ?? []).map((application) => {
      const readiness = computeReadiness(application);
      const nba = computeNextBestAction(application, readiness);
      return {
        application,
        readiness,
        next: {
          label: nba.primary,
          href: nextActionHref(application.id, nba),
          primary: nba.key !== "open",
        },
      };
    });
  }, [applications]);

  const counts: BucketCounts = useMemo(() => {
    const c = { total: rows.length, active: 0, inSetup: 0, blocked: 0 };
    for (const row of rows) {
      c[bucketRow(row)] += 1;
    }
    return c;
  }, [rows]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title="Applications"
          description="Protect MCP servers, APIs, and services with AuthSec."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCcw className="mr-2 size-4" />
                Refresh
              </Button>
              <Button onClick={() => navigate("/applications/new")}>
                <Plus className="mr-2 size-4" />
                Create application
              </Button>
            </div>
          }
        />

        <SummaryStrip counts={counts} loading={isLoading} />

        <TableCard className="p-0">
          {isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Loading applications…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No applications yet.
              </p>
              <Button
                className="mt-4"
                onClick={() => navigate("/applications/new")}
              >
                Create the first application
              </Button>
            </div>
          ) : (
            <ApplicationsTable
              rows={rows}
              onOpenApplication={(application) =>
                navigate(`/applications/${application.id}/overview`)
              }
            />
          )}
        </TableCard>
      </div>
    </div>
  );
}

function SummaryStrip({
  counts,
  loading,
}: {
  counts: BucketCounts;
  loading: boolean;
}) {
  const cells = [
    { label: "Total", value: counts.total, tone: "info" as const, hint: "applications" },
    { label: "Active", value: counts.active, tone: "ok" as const, hint: "protecting traffic" },
    { label: "In setup", value: counts.inSetup, tone: "warn" as const, hint: "need attention" },
    { label: "Blocked", value: counts.blocked, tone: "err" as const, hint: "can't launch" },
  ];

  const TONE: Record<typeof cells[number]["tone"], { dot: string; text: string }> = {
    ok: { dot: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
    warn: { dot: "bg-[var(--color-warning)]", text: "text-[var(--color-warning)]" },
    err: { dot: "bg-[var(--color-danger)]", text: "text-[var(--color-danger)]" },
    info: { dot: "bg-[var(--color-primary)]", text: "text-[var(--color-primary)]" },
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => {
        const tone = TONE[cell.tone];
        return (
          <Card key={cell.label} className="flex items-center gap-3 p-4">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", tone.dot)}
            />
            <div className="min-w-0">
              <p className={cn("text-[10px] font-bold uppercase tracking-wide", tone.text)}>
                {cell.label}
              </p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold leading-none text-foreground">
                  {loading ? "…" : cell.value}
                </span>
                <span className="text-xs text-muted-foreground">{cell.hint}</span>
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
