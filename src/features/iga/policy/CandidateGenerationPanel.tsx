/**
 * CandidateGenerationPanel — triggers candidate rule generation from
 * discovery evidence and polls the resulting job until completion.
 *
 * Uses `useTriggerCandidateGenerationMutation` to kick off the job and
 * `useGetCandidateJobQuery` to poll progress.  When the job completes
 * it shows warnings (if any) and a link to the resulting draft.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";

import {
  useTriggerCandidateGenerationMutation,
  useGetCandidateJobQuery,
  type CandidateJob,
} from "./policyApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map job status to a human-readable label. */
function statusLabel(status: CandidateJob["status"]): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "running":
      return "Generating candidates\u2026";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ status }: { status: CandidateJob["status"] }) {
  const pct =
    status === "completed"
      ? 100
      : status === "failed"
        ? 100
        : status === "running"
          ? 60
          : 15;

  const color =
    status === "completed"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-blue-500";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-surface-subtle)">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Warnings list ────────────────────────────────────────────────────────────

function WarningsList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-(--color-warning-text)">
        <AlertTriangle className="size-3.5" />
        {warnings.length} warning{warnings.length === 1 ? "" : "s"}
      </p>
      <ul className="list-inside list-disc space-y-0.5 text-xs text-(--color-text-muted)">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface CandidateGenerationPanelProps {
  policyId: string;
}

export function CandidateGenerationPanel({ policyId }: CandidateGenerationPanelProps) {
  const [triggerGeneration, { isLoading: isTriggering }] =
    useTriggerCandidateGenerationMutation();

  // Track the active job id so we can poll it.
  const [jobId, setJobId] = useState<string | null>(null);

  // Poll the candidate job while it is still running.
  const {
    data: job,
    isLoading: isPolling,
  } = useGetCandidateJobQuery(jobId!, {
    skip: !jobId,
    pollingInterval: jobId ? 2000 : 0,
  });

  // Stop polling once the job reaches a terminal state.
  const isTerminal = job?.status === "completed" || job?.status === "failed";

  // When the job reaches a terminal state we clear the polling interval
  // by setting jobId to null (skip: true) — but we keep `job` around.
  useEffect(() => {
    if (isTerminal && jobId) {
      // Small delay so the final poll result is used before we stop.
      const timer = setTimeout(() => setJobId(null), 500);
      return () => clearTimeout(timer);
    }
  }, [isTerminal, jobId]);

  const handleGenerate = useCallback(async () => {
    try {
      const result = await triggerGeneration({ workload_ids: [] }).unwrap();
      setJobId(result.id);
      toast.success("Candidate generation started");
    } catch (err: any) {
      const msg =
        err?.data?.error ?? err?.message ?? "Failed to start candidate generation";
      toast.error(typeof msg === "string" ? msg : "Failed to start candidate generation");
    }
  }, [triggerGeneration]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isActive = !!jobId || isPolling;

  return (
    <Panel
      title="Candidate Generation"
      description="Generate policy rules from discovery evidence collected by agents."
    >
      <div className="space-y-4">
        {/* Trigger button */}
        {!job && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={isTriggering || isActive}
            onClick={() => void handleGenerate()}
          >
            {isTriggering ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate from Evidence
              </>
            )}
          </Button>
        )}

        {/* Active / completed job view */}
        {job && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-(--color-text)">
                {statusLabel(job.status)}
              </p>
              {job.status === "completed" && (
                <CheckCircle2 className="size-4 text-green-500" />
              )}
              {(job.status === "pending" || job.status === "running") && (
                <Loader2 className="size-4 animate-spin text-blue-500" />
              )}
            </div>

            <ProgressBar status={job.status} />

            <WarningsList warnings={job.warnings} />

            {job.status === "completed" && (
              <div className="flex items-center gap-3">
                <Link
                  to={`/iga/policies/${job.policy_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-primary) hover:underline"
                >
                  View Draft
                  <ExternalLink className="size-3.5" />
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setJobId(null);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {job.status === "failed" && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-(--color-danger-text)">
                  Generation failed. Try again or check agent connectivity.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setJobId(null);
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
