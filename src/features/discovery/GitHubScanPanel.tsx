/**
 * Run a scan, follow it while it runs, and report the outcome honestly.
 *
 * The API returns four per-repository outcomes and this screen keeps them
 * separate, because they demand different things from the admin:
 *
 *   scanned    we read it
 *   excluded   you chose not to        → neutral. Your decision, not a problem.
 *   failed     we could not            → warning, with the cause.
 *   truncated  we read only part of it → its own state. Neither pass nor fail.
 *
 * ASYNC. A scan is queued, not run inside the request: POST returns 202 with a
 * run, and a worker executes it. So this panel has states the old one did not —
 * queued, running with advancing counters, cancelled — and, crucially, a
 * FINISHED run is a durable row rather than a response body, so it survives a
 * refresh and has history.
 *
 * The rule that matters most is unchanged and now has two inputs. Nothing here
 * may read as a clean result unless the run is FINISHED, `complete_for_selected
 * _scope` is true, AND `degraded` is false. Counters advance while running, so
 * every number is a floor until the run is terminal; and `degraded` catches the
 * case `complete` structurally cannot — a run that hit a 403, was interrupted,
 * then resumed cleanly would otherwise finish claiming coverage it never had.
 */

import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  GitBranch,
  History,
  Loader2,
  MinusCircle,
  Play,
  Scissors,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  discoveryApi,
  isScanRunTerminal,
  useCancelScanRunMutation,
  useGetScanRunQuery,
  useListScanRunsQuery,
  useListSourceRepositoriesQuery,
  useScanGitHubSourceMutation,
  type ScanRun,
} from "@/app/api/discoveryApi";

function Counter({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "neutral" | "muted" | "warning" | "danger";
  hint?: string;
}) {
  const toneCls = {
    neutral: "text-foreground",
    muted: "text-muted-foreground",
    warning: "text-(--color-warning-text)",
    danger: "text-(--color-danger-text)",
  }[tone];

  return (
    <div className="min-w-0 space-y-0.5">
      <div className={`flex items-center gap-1.5 ${toneCls}`}>
        <Icon className="size-3.5 shrink-0" />
        <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
      </div>
      <p className="text-xs font-medium">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A finished run is clean only if it covered everything AND nothing was denied. */
function isClean(run: ScanRun): boolean {
  return (
    run.status === "succeeded" && run.complete_for_selected_scope && !run.degraded
  );
}

export function GitHubScanPanel({ sourceId }: { sourceId: string }) {
  const dispatch = useDispatch();
  const [scan, { isLoading: queueing }] = useScanGitHubSourceMutation();
  const [cancelRun, { isLoading: cancelling }] = useCancelScanRunMutation();

  // The run being followed. Set when we queue one, when a 409 hands back the one
  // already in flight, or on mount from history — a scan started in another tab,
  // or before a refresh, is still ours to watch.
  const [runId, setRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: history = [] } = useListScanRunsQuery(sourceId);

  // Poll only while the followed run is unfinished. Terminal runs are static, so
  // polling one is pure noise on the API.
  const { data: followed } = useGetScanRunQuery(runId ?? "", {
    skip: !runId,
    pollingInterval: 2500,
    skipPollingIfUnfocused: true,
  });

  // Newest run for this source, whatever its state. This is what makes a
  // finished scan survive a refresh, and what re-attaches to a run still going.
  const latest = useMemo<ScanRun | undefined>(
    () => followed ?? history[0],
    [followed, history],
  );

  // Adopt an in-flight run found in history so its counters advance on screen
  // instead of sitting frozen at whatever the list happened to catch.
  useEffect(() => {
    if (runId) return;
    const active = history.find((r) => !isScanRunTerminal(r.status));
    if (active) setRunId(active.id);
  }, [history, runId]);

  // Announce the transition once, and only from a run we were actually watching
  // — otherwise opening the page would toast the result of an old scan.
  const [announced, setAnnounced] = useState<string | null>(null);
  useEffect(() => {
    if (!followed || !isScanRunTerminal(followed.status)) return;
    if (announced === followed.id) return;
    setAnnounced(followed.id);

    // The inventory and coverage move when a run FINISHES, not when it is
    // queued, so the refetch belongs here. Doing it on the queue call would
    // refetch an inventory that had not changed yet and present it as fresh —
    // and nothing would refetch when the findings actually landed.
    dispatch(
      discoveryApi.util.invalidateTags([
        "DiscoveredAgent",
        "AgentCoverage",
        "DiscoverySource",
        { type: "DiscoverySource", id: sourceId },
        { type: "ScanRun", id: sourceId },
      ]),
    );

    if (followed.status === "cancelled") {
      toast("Scan cancelled", { icon: "🚫" });
    } else if (followed.status === "failed") {
      toast.error(followed.error || "The scan failed.");
    } else if (isClean(followed)) {
      toast.success(
        followed.sightings_new > 0
          ? `${followed.sightings_new} new agent${followed.sightings_new === 1 ? "" : "s"} found`
          : "Scan complete — nothing new",
      );
    } else {
      // Deliberately not a success toast: the scan did not cover the scope.
      toast("Scan finished with partial coverage", { icon: "⚠️" });
    }
  }, [followed, announced, dispatch, sourceId]);

  // Shares the repository query with the selection panel (RTK dedupes it), so
  // this panel can tell whether anything is actually in scope. A newly added
  // organisation starts with an EMPTY selection, which makes this the state of
  // the very first visit rather than an edge case.
  const { data: repoData } = useListSourceRepositoriesQuery(sourceId);
  const nothingSelected = repoData != null && !repoData.repos.some((r) => r.selected);

  const active = latest != null && !isScanRunTerminal(latest.status);

  const start = async () => {
    try {
      const res = await scan(sourceId).unwrap();
      setRunId(res.id);
    } catch (err) {
      const e = err as { status?: number; data?: { error?: string; data?: ScanRun } };
      // 409 is not a failure: a scan is already going and the body hands it back.
      // Attaching to it is what makes an impatient double-click harmless.
      if (e.status === 409 && e.data?.data?.id) {
        setRunId(e.data.data.id);
        toast("A scan is already running — showing that one.");
        return;
      }
      toast.error(e.data?.error ?? "The scan could not be queued.");
    }
  };

  const stop = async () => {
    if (!latest) return;
    try {
      await cancelRun({ runId: latest.id, sourceId }).unwrap();
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ?? "Could not cancel the scan.",
      );
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Scan</h3>
            <p className="text-xs text-muted-foreground">
              Reads the configuration files in your selected repositories. Never clones a
              repository, and never stores source code or secret values.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
                <History className="mr-1.5 size-3.5" />
                {showHistory ? "Hide history" : "History"}
              </Button>
            )}
            {active ? (
              <Button size="sm" variant="outline" onClick={stop} disabled={cancelling}>
                <Ban className="mr-1.5 size-3.5" />
                {cancelling ? "Cancelling…" : "Cancel scan"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-[length:var(--text-sm)] text-white"
                onClick={start}
                disabled={queueing || nothingSelected}
              >
                <Play className="mr-1.5 size-3.5" />
                {queueing ? "Queueing…" : "Run scan"}
              </Button>
            )}
          </div>
        </div>

        {nothingSelected && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No repositories are selected yet, so there is nothing to scan. Choose
            repositories above and save the selection first — a scan with an empty scope
            would report success having looked at nothing.
          </p>
        )}

        {latest && <RunReport run={latest} />}

        {showHistory && history.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Previous scans</p>
            <div className="divide-y rounded-md border">
              {history.slice(0, 10).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRunId(r.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 ${
                    r.id === latest?.id ? "bg-muted/40" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <StatusPill run={r} />
                    <span className="text-muted-foreground">
                      {r.repos_scanned}/{r.repos_selected} repos · {r.sightings_new} new
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(r.finished_at ?? r.queued_at), {
                      addSuffix: true,
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One-word state, coloured by what it demands of the reader. */
function StatusPill({ run }: { run: ScanRun }) {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-muted text-muted-foreground" },
    running: { label: "Running", cls: "bg-(--color-info-soft) text-(--color-info-text)" },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
    failed: {
      label: "Failed",
      cls: "bg-(--color-danger-soft) text-(--color-danger-text)",
    },
    succeeded: isClean(run)
      ? { label: "Complete", cls: "bg-(--color-success-soft) text-(--color-success-text)" }
      : // Succeeded but not clean. NOT green: the run finished, the coverage did
        // not, and a green tick over that teaches someone to trust a wrong number.
        { label: "Partial", cls: "bg-(--color-warning-soft) text-(--color-warning-text)" },
  };
  const m = map[run.status] ?? map.queued;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function RunReport({ run }: { run: ScanRun }) {
  const terminal = isScanRunTerminal(run.status);
  const clean = isClean(run);

  return (
    <div className="space-y-4 border-t pt-4">
      {!terminal ? (
        /* In progress. No verdict yet — the counters below are advancing, and
           presenting any of them as an outcome would be presenting a partial
           read as a total. */
        <div className="flex items-start gap-2 rounded-md bg-(--color-info-soft) px-3 py-2">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-(--color-info-text)" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-(--color-info-text)">
              {run.status === "queued" ? "Queued" : "Scanning…"}
            </p>
            <p className="text-xs text-(--color-info-text)">
              {run.status === "queued"
                ? "Waiting for a worker to pick this up. You can leave this page — the scan keeps running and the result is kept."
                : `${run.repos_scanned} of ${run.repos_selected} repositories read so far. These numbers are still moving.`}
            </p>
            {run.repos_selected > 0 && run.status === "running" && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-(--color-info-text)/20">
                <div
                  className="h-full rounded-full bg-(--color-info-text) transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((run.repos_scanned / run.repos_selected) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ) : run.status === "failed" ? (
        <div className="flex items-start gap-2 rounded-md bg-(--color-danger-soft) px-3 py-2">
          <XCircle className="mt-0.5 size-4 shrink-0 text-(--color-danger-text)" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--color-danger-text)">Scan failed</p>
            <p className="text-xs text-(--color-danger-text)">
              {run.error || "The scan stopped before it finished."} Anything counted below
              was read before it stopped.
            </p>
          </div>
        </div>
      ) : run.status === "cancelled" ? (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2">
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Scan cancelled</p>
            <p className="text-xs text-muted-foreground">
              Stopped before it finished. What it read is below and is real, but it is not
              a picture of everything you selected.
            </p>
          </div>
        </div>
      ) : clean ? (
        <div className="flex items-start gap-2 rounded-md bg-(--color-success-soft) px-3 py-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--color-success-text)" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--color-success-text)">
              Complete for the repositories you selected
            </p>
            <p className="text-xs text-(--color-success-text)">
              Every selected repository was read. Repositories not granted to the
              installation are still outside this result.
            </p>
          </div>
        </div>
      ) : (
        /* Succeeded, but either coverage fell short or something was denied
           along the way. Both are the same message to the reader: this is a
           floor, not a total. */
        <div className="flex items-start gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--color-warning-text)">
              Partial coverage
            </p>
            <p className="text-xs text-(--color-warning-text)">
              This scan did not cover everything you selected. The counts below are a
              floor, not a total — there may be agents we did not see.
            </p>
          </div>
        </div>
      )}

      {/* Degraded is its own line, not folded into the verdict above. A run can
          be complete AND degraded — resumed after a denial — and that case would
          otherwise render as a clean result, which is exactly the belief this
          column exists to prevent. */}
      {run.degraded && (
        <div className="flex items-start gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--color-warning-text)">
              Something was denied or cut short during this scan
            </p>
            <p className="text-xs text-(--color-warning-text)">
              At some point this run could not read everything it asked for — a permission
              refusal, a truncated tree, or an API failure. That happened even if the run
              later finished, so treat these counts as a floor.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Counter
          icon={CheckCircle2}
          label="Scanned"
          value={run.repos_scanned}
          tone="neutral"
          hint={run.repos_selected > 0 ? `of ${run.repos_selected} selected` : undefined}
        />
        <Counter
          icon={MinusCircle}
          label="Excluded"
          value={run.repos_excluded}
          tone="muted"
          hint="Your choice"
        />
        {/* Repository-level. A file-level count lives in the summary row below:
            a repository can open fine and still have unreadable files in it, and
            collapsing the two is what let "0 failed" sit beside a wall of
            warnings. */}
        <Counter
          icon={XCircle}
          label="Repos failed"
          value={run.repos_failed}
          tone={run.repos_failed > 0 ? "danger" : "muted"}
          hint={run.repos_failed > 0 ? "Would not open" : undefined}
        />
        <Counter
          icon={Scissors}
          label="Truncated"
          value={run.repos_truncated}
          tone={run.repos_truncated > 0 ? "warning" : "muted"}
          hint={run.repos_truncated > 0 ? "Read in part" : undefined}
        />
      </div>

      {/* Only when the run actually looked beyond default branches. Showing a
          zero here on every default-branch scan would imply branches were
          considered and found wanting. */}
      {run.branch_mode === "all" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <GitBranch className="size-3.5" />
            All branches
          </span>
          <span>
            <span className="font-semibold tabular-nums">{run.branches_scanned}</span>{" "}
            <span className="text-muted-foreground">branches read</span>
          </span>
          {run.branches_skipped > 0 && (
            <span className="text-(--color-warning-text)">
              <span className="font-semibold tabular-nums">{run.branches_skipped}</span>{" "}
              skipped — over the {run.max_branches}-branch cap, so this cannot be complete
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs">
        <span>
          <span className="font-semibold tabular-nums">{run.sightings_new}</span>{" "}
          <span className="text-muted-foreground">new agents</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{run.sightings_bumped}</span>{" "}
          <span className="text-muted-foreground">still present</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{run.files_fetched}</span>{" "}
          <span className="text-muted-foreground">files read</span>
        </span>
        {run.files_failed > 0 && (
          <span className="text-(--color-warning-text)">
            <span className="font-semibold tabular-nums">{run.files_failed}</span>{" "}
            files could not be read
          </span>
        )}
        <span className="text-muted-foreground">
          {terminal && run.finished_at
            ? `finished ${formatDistanceToNow(new Date(run.finished_at), { addSuffix: true })}`
            : `queued ${formatDistanceToNow(new Date(run.queued_at), { addSuffix: true })}`}
        </span>
        {run.attempts > 1 && (
          <span className="text-muted-foreground">
            attempt {run.attempts} of {run.max_attempts} — resumed where it stopped
          </span>
        )}
      </div>

      {run.excluded_repositories && run.excluded_repositories.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Excluded by your selection
          </p>
          <p className="text-xs text-muted-foreground">
            {run.excluded_repositories.join(", ")}
          </p>
        </div>
      )}

      {run.warnings && run.warnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-(--color-warning-text)">Warnings</p>
          <ul className="space-y-0.5">
            {run.warnings.map((w: string) => (
              <li key={w} className="text-xs text-muted-foreground">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Findings appear in{" "}
        <span className="font-medium text-foreground">Discovered agents</span> as
        unregistered, marked <em>declared in code</em> — a declaration is not proof that
        an agent ran.
      </p>
    </div>
  );
}
