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
import { Button } from "@/components/ui/button";

import { computeReadiness, isLaunched } from "./lib/computeReadiness";
import {
  computeNextBestAction,
  nextActionHref,
} from "./lib/computeNextBestAction";
import {
  ApplicationsTable,
  type ApplicationTableRow,
} from "./components/ApplicationsTable";
import {
  consolePage,
  DecisionBanner,
  InlineStat,
  SectionHeader,
  Surface,
} from "./components/ApplicationConsole";

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

  const firstBlocked = rows.find((row) => bucketRow(row) !== "active");

  return (
    <div className="min-h-screen bg-slate-50/70">
      <div className={consolePage}>
        <SectionHeader
          title="Applications"
          description="Triage protected MCP servers, APIs, and services by launch readiness and runtime risk."
          actions={
            <>
              <Button variant="outline" onClick={() => refetch()} className="h-9">
                <RefreshCcw className="mr-2 size-4" />
                Refresh
              </Button>
              <Button onClick={() => navigate("/applications/new")} className="h-9">
                <Plus className="mr-2 size-4" />
                Create application
              </Button>
            </>
          }
        />

        <DecisionBanner
          tone={counts.blocked > 0 || counts.inSetup > 0 ? "warning" : "success"}
          title={
            isLoading
              ? "Reading application readiness"
              : counts.blocked > 0
                ? `${counts.blocked} application${counts.blocked === 1 ? "" : "s"} blocked`
                : counts.inSetup > 0
                  ? `${counts.inSetup} application${counts.inSetup === 1 ? "" : "s"} need setup`
                  : "All applications healthy"
          }
          body={
            firstBlocked
              ? `${firstBlocked.application.name} is the next resource to resolve. AuthSec keeps unreviewed tools denied until launch gates pass.`
              : "Runtime policy is active for every launched application."
          }
          actionLabel={firstBlocked ? firstBlocked.next.label : "Create app"}
          actionHref={firstBlocked ? firstBlocked.next.href : "/applications/new"}
        />

        <Surface className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <InlineStat label="applications" value={loadingValue(isLoading, counts.total)} tone="info" />
          <InlineStat label="live" value={loadingValue(isLoading, counts.active)} tone="success" />
          <InlineStat label="need setup" value={loadingValue(isLoading, counts.inSetup)} tone="warning" />
          <InlineStat label="blocked" value={loadingValue(isLoading, counts.blocked)} tone="danger" />
        </Surface>

        <div>
          {isLoading ? (
            <Surface className="px-4 py-12 text-center text-sm text-slate-500">
              Loading applications…
            </Surface>
          ) : rows.length === 0 ? (
            <Surface className="px-4 py-12 text-center">
              <p className="text-sm text-slate-500">
                No applications yet.
              </p>
              <Button
                className="mt-4"
                onClick={() => navigate("/applications/new")}
              >
                Create the first application
              </Button>
            </Surface>
          ) : (
            <ApplicationsTable
              rows={rows}
              onOpenApplication={(application) =>
                navigate(`/applications/${application.id}/overview`)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function loadingValue(loading: boolean, value: number) {
  return loading ? "…" : value;
}
