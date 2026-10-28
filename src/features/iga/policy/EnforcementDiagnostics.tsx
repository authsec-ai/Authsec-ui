import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RolloutTarget } from "./policyApi";

export function EnforcementDiagnostics({ target }: { target: RolloutTarget }) {
  const [expanded, setExpanded] = useState(false);

  if (target.state !== "failed" && !target.error) return null;

  // Categorize the error
  const category = categorizeError(target.error);

  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Diagnostics
      </button>
      {expanded && (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Category</span>
            <span>{category}</span>
          </div>
          {target.error && (
            <div>
              <span className="font-medium">Error</span>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{target.error}</pre>
            </div>
          )}
          <div className="flex justify-between">
            <span className="font-medium">Controls</span>
            <span>{target.controls_verified}/{target.controls_total} verified</span>
          </div>
          {target.last_receipt_at && (
            <div className="flex justify-between">
              <span className="font-medium">Last receipt</span>
              <span>{new Date(target.last_receipt_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function categorizeError(error: string | null): string {
  if (!error) return "Unknown";
  if (error.includes("signature")) return "Signature rejection";
  if (error.includes("adapter")) return "Missing adapter";
  if (error.includes("apply")) return "Apply failure";
  if (error.includes("probe") || error.includes("health")) return "Probe failure";
  if (error.includes("stale") || error.includes("timeout")) return "Stale collector";
  return "General failure";
}
