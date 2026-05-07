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
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCcw } from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import {
  computeNextBestAction,
  nextActionHref,
} from "./lib/computeNextBestAction";
import type { Application, ReadinessArea, ReadinessState } from "./types";

interface AppRow {
  application: Application;
  readiness: ReturnType<typeof computeReadiness>;
  next: {
    label: string;
    href: string;
    primary: boolean;
  };
}

interface BucketCounts {
  total: number;
  active: number;
  inSetup: number;
  blocked: number;
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
    dot: "bg-[var(--color-danger)]",
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
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {area.status}
    </span>
  );
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

        <Card variant="table" className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Protection</th>
                  <th className="px-4 py-3">Tools</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Launch</th>
                  <th className="px-4 py-3 text-right">Next action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Loading applications…
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        No applications yet.
                      </p>
                      <Button
                        className="mt-4"
                        onClick={() => navigate("/applications/new")}
                      >
                        Create the first application
                      </Button>
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <ApplicationRow key={row.application.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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

function ApplicationRow({ row }: { row: AppRow }) {
  const navigate = useNavigate();
  const { application, readiness, next } = row;
  const overviewPath = `/applications/${application.id}/overview`;

  const onActivate = () => navigate(overviewPath);

  return (
    <tr
      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/30 focus-within:bg-muted/30"
      onClick={onActivate}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <td className="max-w-xs px-4 py-3">
        <div className="font-semibold text-foreground">{application.name}</div>
        {application.resource_uri && (
          <div className="mt-0.5 truncate text-xs font-mono text-muted-foreground">
            {application.resource_uri}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          MCP
        </span>
      </td>
      <td className="px-4 py-3">
        <StatePill area={readiness.protection} />
      </td>
      <td className="px-4 py-3">
        <StatePill area={readiness.tools} />
      </td>
      <td className="px-4 py-3">
        <StatePill area={readiness.access} />
      </td>
      <td className="px-4 py-3">
        <StatePill area={readiness.launch} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          asChild
          size="sm"
          variant={next.primary ? "default" : "outline"}
          onClick={(e) => e.stopPropagation()}
        >
          <Link to={next.href}>
            {next.label} <span aria-hidden>→</span>
          </Link>
        </Button>
      </td>
    </tr>
  );
}
