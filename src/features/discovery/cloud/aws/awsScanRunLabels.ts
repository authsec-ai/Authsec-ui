/** How a scan run reads in words: its state, and what became of its graph build. */

import type { CloudScanRunHistoryItem as CloudScanRun } from "@/app/api/cloudDiscoveryApi";
import type { StatusTone } from "@/components/ui/status-badge";

export const RUN_TONE: Record<CloudScanRun["status"], StatusTone> = {
  queued: "muted",
  running: "info",
  published: "success",
  failed: "danger",
  abandoned: "danger",
};

export const RUN_LABEL: Record<CloudScanRun["status"], string> = {
  queued: "Queued",
  running: "Scanning",
  published: "Finished",
  failed: "Failed",
  abandoned: "Abandoned",
};

export function graphOutcome(run: CloudScanRun): string | null {
  const p = run.projection;
  if (run.status !== "published" || !p) return null;
  switch (p.status) {
    case "queued":
      return "Waiting to build the graph from this scan…";
    case "running":
      return p.attempts > 1 ? `Building the graph from this scan (attempt ${p.attempts})…` : "Building the graph from this scan…";
    case "complete":
      return p.rev != null ? `Added to the graph as revision ${p.rev}.` : "Added to the graph.";
    case "failed":
      return p.retrying
        ? `Building the graph failed on attempt ${p.attempts}${p.last_error ? ` (${p.last_error})` : ""}; it will be tried again.`
        : `Building the graph from this scan failed${p.last_error ? ` (${p.last_error})` : ""}; the graph still shows the previous result.`;
    case "abandoned":
      return "Building the graph from this scan was abandoned; the graph still shows the previous result.";
  }
}

