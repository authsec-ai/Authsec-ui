/**
 * WorkloadAccessTab — observed access, native grants, and active controls
 * for a workload detail page.
 *
 * Each panel is a placeholder until the underlying data sources (collector
 * events, IAM sync, runtime enforcement) are wired in later batches.
 */

import { Network, KeyRound, ShieldCheck } from "lucide-react";

import { Panel } from "../shared/components/Panel";

// ── Placeholder content ──────────────────────────────────────────────────────

function PlaceholderBody({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-(--color-text-muted)">{message}</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function WorkloadAccessTab({ workloadId }: { workloadId: string }) {
  // workloadId will be used once the data-fetching hooks are available.
  void workloadId;

  return (
    <div className="space-y-4">
      {/* ── Observed Access ─────────────────────────────────────────────── */}
      <Panel
        title="Observed Access"
        description="Network connections, file accesses, and exec events observed by the collector."
        actions={
          <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
            <Network className="size-3.5" />
          </span>
        }
      >
        <PlaceholderBody message="Observed access events will appear here once a collector is reporting for this workload. Connect a collector to begin monitoring network, file, and process activity." />
      </Panel>

      {/* ── Native Grants ──────────────────────────────────────────────── */}
      <Panel
        title="Native Grants"
        description="IAM roles, service accounts, and permissions natively assigned to this workload."
        actions={
          <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
            <KeyRound className="size-3.5" />
          </span>
        }
      >
        <PlaceholderBody message="Native grants will appear here once IAM synchronisation is configured. This includes cloud IAM roles, Kubernetes service accounts, and any other identity bindings." />
      </Panel>

      {/* ── Active Controls ────────────────────────────────────────────── */}
      <Panel
        title="Active Controls"
        description="AuthSec runtime controls currently enforced on this workload."
        actions={
          <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
            <ShieldCheck className="size-3.5" />
          </span>
        }
      >
        <PlaceholderBody message="Active runtime controls will appear here once a policy targeting this workload has been published and enforced by the AuthSec agent." />
      </Panel>
    </div>
  );
}
