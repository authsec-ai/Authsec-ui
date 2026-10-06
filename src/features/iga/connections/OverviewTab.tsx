/**
 * Overview: the four conditions a connection has, said apart; the tracker from
 * "connected" to "open in Discovery" with each step's state and next action;
 * and the provider's own facts. Nothing here is a single badge, and nothing
 * reads "connected" as "ready".
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, Circle, CircleDot, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";

import { useListAwsScanRunsQuery } from "@/app/api/cloudDiscoveryApi";
import { RUN_LABEL } from "@/features/discovery/cloud/aws/awsScanRunLabels";
import { safeErrorProse } from "@/features/discovery/cloud/cloudConnectorErrorCopy";

import type { Connection } from "@/app/api/connectionsApi";
import { Button } from "@/components/ui/button";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { Panel } from "@/features/iga/shared/components/Panel";
import { cn } from "@/lib/utils";

import {
  STEP_STATE_WORD,
  ago,
  coverageText,
  day,
  detailHref,
  discoveryLink,
  gapWords,
  graphText,
  inventoryLagsHeartbeat,
  holdsLine,
  k8sHealthLine,
  lastScanText,
  primaryOf,
  reasonCopy,
  trackerOf,
  type ActionSet,
  type Step,
  type StepState,
} from "./connectionModel";
import { AwsFacts, GcpFacts, GitHubFacts, K8sFacts } from "./ProviderFacts";
import { useSourceFacts } from "./providerData";
import { PENDING_WORD, type ActionKind } from "./useConnectionActions";
import { graphCell } from "./scanCells";
import { LoadFailurePanel } from "@/components/console/load-state";
import { loadFailureOf } from "@/components/console/load-failure";

/* ------------------------------ the four conditions ------------------------------ */

function connectionPill(c: Connection) {
  switch (c.connection.state) {
    case "connected":
      return <CloudPill tone="success">Connected</CloudPill>;
    case "authentication_failed":
      return <CloudPill tone="danger">Authentication failed</CloudPill>;
    case "revoked":
      return <CloudPill tone="muted">{primaryOf(c).label}</CloudPill>;
    case "not_verified":
      return <CloudPill tone="warning">{primaryOf(c).label}</CloudPill>;
    default:
      return <CloudPill tone="muted">Status unknown</CloudPill>;
  }
}

function connectionSentence(c: Connection): string {
  switch (c.connection.state) {
    case "connected":
      return c.provider === "k8s"
        ? `${k8sHealthLine(c)}.`
        : c.connection.verified_at
          ? `AuthSec can read it. Verified ${ago(c.connection.verified_at)}.`
          : "AuthSec can read it.";
    case "authentication_failed": {
      const r = reasonCopy(c);
      return `${r.cause}. ${r.action}`;
    }
    case "revoked": {
      if (c.provider === "aws" || c.provider === "gcp") return "AuthSec no longer reads it. Its last results are kept, and are no longer reconfirmed.";
      const r = reasonCopy(c);
      return `${r.cause}. AuthSec no longer reads it. Its last results are kept, and are no longer reconfirmed.`;
    }
    case "not_verified": {
      const r = reasonCopy(c);
      return `${r.cause}. ${r.action}`;
    }
    default:
      return "AuthSec reports a connection state this console does not recognise.";
  }
}

/** What a revoked (or disabled) connection means, per provider: the removal paths differ. */
function revokedConsequence(c: Connection): string {
  switch (c.provider) {
    case "aws":
      return "Earlier results stay in Discovery, marked stale. Reconnect the account to resume.";
    case "gcp":
      return "Earlier results stay in Discovery, marked stale. Reconnect the project to resume.";
    case "k8s":
      return "Earlier results stay, marked stale. Removing the connection deletes its sightings; graph objects stay.";
    case "github":
      return "Earlier results stay, marked stale. Removing the connection deletes its sightings.";
    default:
      return "Earlier results stay, marked stale.";
  }
}

function scanPill(c: Connection) {
  switch (c.scan.state) {
    case "queued":
      return <CloudPill tone="info">Queued</CloudPill>;
    case "running":
      return <CloudPill tone="info">Running</CloudPill>;
    case "finished":
      return <CloudPill tone="success">Finished</CloudPill>;
    case "failed":
      return <CloudPill tone="danger">Failed</CloudPill>;
    case "never_run":
      return <CloudPill tone="muted">Never run</CloudPill>;
    default:
      return <CloudPill tone="muted">Unknown</CloudPill>;
  }
}

function scanSentence(c: Connection): string {
  if (c.provider === "k8s") {
    // The inventory date is a sweep's; the heartbeat is the agent's. Never one for the other.
    if (!c.scan.at) return "No inventory received yet. The agent reports on its own schedule.";
    return `Inventory from the sweep on ${day(c.scan.at)} (${ago(c.scan.at)}).${inventoryLagsHeartbeat(c) ? " The agent is online, but its last inventory is older than its heartbeat." : ""}`;
  }
  switch (c.scan.state) {
    case "never_run":
      return "No scan has run yet.";
    case "queued":
      return `Queued. ${holdsLine(c)}.`;
    case "running":
      return `Running. ${holdsLine(c)}.`;
    case "failed":
      return `${lastScanText(c)}. ${holdsLine(c)}.`;
    case "finished":
      return `${lastScanText(c)}.`;
    default:
      return "AuthSec reports a scan state this console does not recognise.";
  }
}

function coveragePill(c: Connection) {
  const text = coverageText(c);
  const tone = c.coverage.state === "complete" ? "success" : c.coverage.state === "unknown" ? "muted" : "warning";
  return <CloudPill tone={tone}>{text}</CloudPill>;
}

function graphPill(c: Connection) {
  const g = graphText(c);
  const tone = c.graph.state === "published" ? "success" : c.graph.state === "failed" ? "danger" : c.graph.state === "publishing" ? "info" : "muted";
  return <CloudPill tone={tone}>{g.text}</CloudPill>;
}

function graphSentence(c: Connection): string {
  switch (c.graph.state) {
    case "published":
      return `Discovery's Published view shows what AuthSec concluded${c.graph.rev != null ? ` at revision ${c.graph.rev}` : ""}.`;
    case "publishing":
      return "The graph is being built from the latest scan. The previous publication stays until it finishes.";
    case "failed":
      return c.graph.published_at
        ? `The graph from ${ago(c.graph.published_at)} is still shown. Scan again to retry.`
        : "Nothing from this account is in the graph yet. Scan again to retry.";
    case "not_published":
      return "Nothing from this account is in a publication yet, so the Published view in Discovery is empty for it.";
    case "unrevisioned":
      return "Kubernetes inventory is written as each sweep arrives. It has no numbered publication, and Discovery labels it by its sweep.";
    case "not_applicable":
      return "This source is not part of the graph. Discovery reads its latest collected results.";
    default:
      return "AuthSec reports a graph state this console does not recognise.";
  }
}

/**
 * The four conditions as one bordered row (2026-10-06 design), drawn by the
 * page above every tab: Access, Latest scan, Coverage, Graph. Each says its
 * state in a word and, under it, the one line that explains it.
 */
export function ReadinessStrip({ c }: { c: Connection }) {
  const gaps = gapWords(c, 3);
  // The explanation is never clamped: it carries the cause, what to do, and links.
  const cell = (name: string, pill: ReactNode, line: ReactNode) => (
    <div className="min-w-0 space-y-1.5 px-4 py-3">
      <p className="text-xs text-(--color-text-muted)">{name}</p>
      <div>{pill}</div>
      <p className="text-xs leading-snug text-(--color-text-muted)">{line}</p>
    </div>
  );
  return (
    <section
      aria-label="Readiness"
      className={cn(
        "grid overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) [&>*]:border-(--color-border-subtle)",
        // One column: a line between each. Two: a cross. Four: a line between each.
        "[&>*+*]:border-t sm:grid-cols-2 sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:[&>*+*]:border-t-0 lg:[&>*+*]:border-l",
      )}
    >
      {cell("Access", connectionPill(c), connectionSentence(c))}
      {cell(c.provider === "k8s" ? "Latest sweep" : "Latest scan", scanPill(c), scanSentence(c))}
      {cell(
        "Coverage",
        coveragePill(c),
        c.coverage.state === "complete" ? (
          "Every requested surface was read."
        ) : c.coverage.state === "unknown" ? (
          "No coverage report yet."
        ) : (
          <>
            {gaps ? `Not fully read: ${gaps}. ` : ""}
            <Link className="font-medium text-(--color-primary-text) hover:underline" to={detailHref(c.id, "coverage")}>
              See what is missing
            </Link>
          </>
        ),
      )}
      {cell("Graph", graphPill(c), graphSentence(c))}
    </section>
  );
}

/** The last three scans, on the Overview; the Scans tab lists them all. AWS only: its runs are listed. */
function RecentScans({ c }: { c: Connection }) {
  // Follows a scan in flight, so it never contradicts the strip above it.
  const live = c.scan.state === "queued" || c.scan.state === "running";
  const q = useListAwsScanRunsQuery({ connectorId: c.id }, { pollingInterval: live ? 5_000 : 0, skipPollingIfUnfocused: true });
  const lastState = useRef(c.scan.state);
  useEffect(() => {
    if (lastState.current !== c.scan.state) {
      lastState.current = c.scan.state;
      void q.refetch();
    }
  }, [c.scan.state, q]);
  const runs = (q.currentData?.data ?? []).slice(0, 3);
  return (
    <Panel
      title="Recent scans"
      flush
      actions={
        <Link to={detailHref(c.id, "scans")} className="font-medium text-(--color-primary-text) hover:underline">
          All scans
        </Link>
      }
    >
      {q.isLoading ? (
        <p className="px-4 py-3 text-xs text-(--color-text-muted)">Loading…</p>
      ) : q.isError && !q.currentData ? (
        <p className="px-4 py-3 text-xs text-(--color-danger-text)">
          Could not load the scans.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      ) : !runs.length ? (
        <p className="px-4 py-3 text-xs text-(--color-text-muted)">No scan has run yet.</p>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {runs.map((r) => {
            const failed = r.status === "failed" || r.status === "abandoned";
            return (
              <li key={r.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-2.5 text-[13px]">
                <span className="tabular-nums text-(--color-text-muted)">{r.queued_at ? format(new Date(r.queued_at), "d MMM, HH:mm") : "—"}</span>
                <span className={failed ? "min-w-0 text-(--color-danger-text)" : "min-w-0 text-(--color-text)"}>
                  {failed && r.last_error ? `Failed: ${safeErrorProse(r.last_error)}` : RUN_LABEL[r.status]}
                </span>
                <span className="text-xs text-(--color-text-muted)" title={graphCell(r).title}>
                  {graphCell(r).text === "—" ? "" : graphCell(r).text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------------- the tracker --------------------------------- */

const STEP_ICON: Record<StepState, ReactNode> = {
  done: <CheckCircle2 className="size-4 text-(--color-success-text)" aria-hidden />,
  next: <CircleDot className="size-4 text-(--color-primary-text)" aria-hidden />,
  working: <Loader2 className="size-4 animate-spin text-(--color-info-text)" aria-hidden />,
  failed: <XCircle className="size-4 text-(--color-danger-text)" aria-hidden />,
  waiting: <Circle className="size-4 text-(--color-text-muted)" aria-hidden />,
};

function StepAction({
  c,
  step,
  actions,
  pending,
  onRun,
  canOpen,
}: {
  c: Connection;
  step: Step;
  actions: ActionSet;
  pending?: ActionKind;
  onRun: (kind: ActionKind) => void;
  canOpen: boolean;
}) {
  switch (step.action) {
    case "verify":
      return actions.verify ? (
        <Button size="sm" variant="outline" disabled={!!pending} onClick={() => onRun("verify")}>
          {pending === "verify" ? PENDING_WORD.verify : "Verify"}
        </Button>
      ) : (
        <span className="text-xs text-(--color-text-muted)">An administrator can verify it.</span>
      );
    case "scan":
      return actions.scan ? (
        <Button size="sm" variant="outline" disabled={!!pending} onClick={() => onRun("scan")}>
          {pending === "scan" ? PENDING_WORD.scan : "Scan now"}
        </Button>
      ) : (
        <span className="text-xs text-(--color-text-muted)">An administrator can start a scan.</span>
      );
    case "scope":
      return actions.editScope ? (
        <Button size="sm" variant="outline" asChild>
          <Link to={detailHref(c.id, "scope")} state={{ editScope: true }}>
            Choose scope
          </Link>
        </Button>
      ) : (
        <span className="text-xs text-(--color-text-muted)">An administrator can choose the scope.</span>
      );
    case "open":
      return canOpen ? (
        <Button size="sm" className="text-[length:var(--text-sm)] text-white" asChild>
          <Link to={discoveryLink(c)}>Open in Discovery</Link>
        </Button>
      ) : null;
    default:
      return null;
  }
}

function Tracker({
  c,
  scopeChosen,
  actions,
  pending,
  onRun,
}: {
  c: Connection;
  scopeChosen: boolean;
  actions: ActionSet;
  pending?: ActionKind;
  onRun: (kind: ActionKind) => void;
}) {
  const steps = trackerOf(c, { scopeChosen });
  const complete = steps.every((s) => s.state === "done");
  const [open, setOpen] = useState(!complete);
  // Setup finishing while the page is open folds the steps away, once.
  const wasComplete = useRef(complete);
  useEffect(() => {
    if (complete && !wasComplete.current) setOpen(false);
    wasComplete.current = complete;
  }, [complete]);
  if (complete && !open) {
    return (
      <section className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-(--color-surface-subtle)">
          <span className="grid size-6 place-items-center rounded-full bg-(--color-success-soft) text-(--color-success-text)">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-(--color-text)">Setup complete</span>
            <span className="block text-xs text-(--color-text-muted)">All {steps.length} steps done.</span>
          </span>
          <span className="text-xs font-medium text-(--color-primary-text)">Show steps</span>
        </button>
      </section>
    );
  }
  return (
    <Panel
      title={complete ? "Setup complete" : "Setup"}
      actions={
        complete ? (
          <button type="button" onClick={() => setOpen(false)} aria-expanded className="font-medium text-(--color-primary-text) hover:underline">
            Hide steps
          </button>
        ) : undefined
      }
    >
      <ol className="divide-y divide-(--color-border-subtle)">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
            <span className="mt-0.5">{STEP_ICON[s.state]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-(--color-text)">
                <span className="text-(--color-text-muted)">{i + 1}. </span>
                {s.title}
                <span
                  className={cn(
                    "ml-2 text-xs font-normal",
                    s.state === "failed" ? "text-(--color-danger-text)" : s.state === "done" ? "text-(--color-success-text)" : "text-(--color-text-muted)",
                  )}
                >
                  {STEP_STATE_WORD[s.state]}
                </span>
              </p>
              <p className="text-xs leading-relaxed text-(--color-text-muted)">{s.detail}</p>
            </div>
            <StepAction c={c} step={s} actions={actions} pending={pending} onRun={onRun} canOpen={c.discovery.ready} />
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ----------------------------------- the tab ----------------------------------- */

export function OverviewTab({
  c,
  actions,
  pending,
  onRun,
}: {
  c: Connection;
  actions: ActionSet;
  pending?: ActionKind;
  onRun: (kind: ActionKind) => void;
}) {
  const source = useSourceFacts(c);
  const primary = primaryOf(c);

  // Whether a scope is chosen is a fact of the provider, not of a word in the summary:
  // a new GitHub organisation scans nothing until repositories are selected.
  let scopeChosen = !/^(0|no)\b/i.test(c.scope_summary.trim()) && c.scope_summary.trim() !== "";
  if (c.provider === "github" && source.data) {
    const sel = (source.data.config?.repositories ?? null) as { mode?: string; include?: string[] } | null;
    scopeChosen = !((sel?.mode ?? "selected") === "selected" && (sel?.include?.length ?? 0) === 0);
  }
  if (c.provider === "k8s") scopeChosen = true;

  return (
    <div className="space-y-4">
      {primary.key === "revoked" ? (
        <div className="flex items-start gap-2 rounded-md border-l-2 border-l-(--color-border-strong) bg-(--color-surface-subtle) px-3 py-2.5 text-xs">
          <AlertTriangle className="mt-px size-3.5 flex-none text-(--color-text-muted)" aria-hidden />
          <div>
            <strong className="font-medium">This connection is {primary.label.toLowerCase()}.</strong> {revokedConsequence(c)}
          </div>
        </div>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="min-w-0 space-y-4">
          {c.provider === "aws" ? <RecentScans c={c} /> : null}
          <Tracker c={c} scopeChosen={scopeChosen} actions={actions} pending={pending} onRun={onRun} />
        </div>
        <div className="min-w-0 space-y-4">
          {c.provider === "aws" ? <AwsFacts c={c} /> : null}
          {c.provider === "gcp" ? <GcpFacts c={c} /> : null}
      {c.provider === "k8s" || c.provider === "github" ? (
        source.isError && !source.data ? (
          <LoadFailurePanel
            failure={loadFailureOf(source.error) ?? "failed"}
            subject="this connection's details"
            permission="discovery:read"
            onRetry={() => void source.refetch()}
          />
        ) : source.data ? (
          c.provider === "k8s" ? (
            <K8sFacts c={c} source={source.data} />
          ) : (
            <GitHubFacts c={c} source={source.data} />
          )
        ) : null
      ) : null}
        </div>
      </div>
    </div>
  );
}
