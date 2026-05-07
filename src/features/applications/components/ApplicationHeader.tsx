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
import { Badge } from "@/components/ui/badge";
import type { Application, Readiness } from "../types";
import { isLaunched } from "../lib/computeReadiness";

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

const TONE_CLASSES: Record<LaunchSummary["tone"], string> = {
  ok: "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)] text-[var(--color-success)]",
  warn: "border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]",
  err: "border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_10%,transparent)] text-[var(--color-danger)]",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function ApplicationHeader({
  application,
  typeLabel = "MCP",
  className,
}: ApplicationHeaderProps) {
  const summary = summariseLaunch(application);
  return (
    <header
      data-slot="application-header"
      className={cn(
        "flex flex-col gap-1 px-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1
            data-slot="application-name"
            className="truncate text-2xl font-semibold tracking-tight text-foreground"
          >
            {application.name}
          </h1>
          {typeLabel && (
            <Badge
              variant="outline"
              className="rounded-full border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {typeLabel}
            </Badge>
          )}
        </div>
        {application.resource_uri && (
          <p className="mt-1 truncate text-sm text-muted-foreground">
            <span className="font-medium text-muted-foreground/80">
              Protected URL:{" "}
            </span>
            <span className="font-mono">{application.resource_uri}</span>
          </p>
        )}
      </div>
      <Link
        to={summary.href}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-90",
          TONE_CLASSES[summary.tone],
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {summary.label}
      </Link>
    </header>
  );
}
