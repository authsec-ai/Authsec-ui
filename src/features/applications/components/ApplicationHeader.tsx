/**
 * `ApplicationHeader` — top of every Application detail page.
 *
 * Layout:
 *   [Name] [type badge]                       [Launch state pill]
 *   Protected URL: <url>
 *
 * The launch state pill reads `state === "ready"` (the real backend
 * signal), not `application.active`. The pill links to the Launch tab.
 *
 * The pill text is intentionally backend-truth, not a fabricated
 * blocker count. The Launch page itself shows the per-gate detail
 * sourced from `useGetSetupChecklistQuery` and `useGetActivationPreviewQuery`.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Application, Readiness } from "../types";
import { isLaunched } from "../lib/computeReadiness";
import { computeNextBestAction, nextActionHref } from "../lib/computeNextBestAction";
import { StatusBadge, toneFromReadiness } from "./ApplicationConsole";

export interface ApplicationHeaderProps {
  application: Pick<
    Application,
    "id" | "name" | "resource_uri" | "active" | "state" | "setup_completed_at"
  >;
  /** Reserved for future pill-status refinement; not currently consumed. */
  readiness?: Readiness;
  typeLabel?: string;
  className?: string;
}

interface LaunchSummary {
  label: string;
  tone: "ok" | "warn" | "err" | "neutral";
  href: string;
}

function summariseLaunch(
  application: ApplicationHeaderProps["application"],
): LaunchSummary {
  const launchHref = `/applications/${application.id}/launch`;
  if (isLaunched(application)) {
    return { label: "Launched", tone: "ok", href: launchHref };
  }
  if (application.state === "scan_failed") {
    return { label: "Scan failed", tone: "err", href: launchHref };
  }
  return { label: "Not launched", tone: "warn", href: launchHref };
}

export function ApplicationHeader({
  application,
  readiness,
  typeLabel = "MCP",
  className,
}: ApplicationHeaderProps) {
  const summary = summariseLaunch(application);
  const next = readiness ? computeNextBestAction(application as Application, readiness) : null;
  return (
    <header
      data-slot="application-header"
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_1px_rgba(15,23,42,0.02)] lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1
            data-slot="application-name"
            className="truncate text-[24px] font-semibold leading-8 tracking-normal text-slate-950"
          >
            {application.name}
          </h1>
          {typeLabel && (
            <StatusBadge>{typeLabel}</StatusBadge>
          )}
        </div>
        {application.resource_uri && (
          <p className="mt-1 truncate font-mono text-sm text-slate-500">
            {application.resource_uri}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to={summary.href}>
          <StatusBadge tone={summary.tone === "ok" ? "success" : summary.tone === "err" ? "danger" : "warning"}>
            {summary.label}
          </StatusBadge>
        </Link>
        {readiness?.tools ? (
          <StatusBadge tone={toneFromReadiness(readiness.tools.state)}>
            {readiness.tools.state === "ok" ? "Tools reviewed" : readiness.tools.status}
          </StatusBadge>
        ) : null}
        {next ? (
          <Link
            to={nextActionHref(application.id, next)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {next.primary}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
