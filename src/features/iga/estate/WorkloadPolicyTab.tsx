/**
 * WorkloadPolicyTab — shows runtime policies applicable to a workload.
 *
 * Rendered inside WorkloadPage when the "Policies" tab is active.
 * Uses the full policy list and filters client-side until the backend
 * supports a per-workload policy query (Batch 11+).
 */

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";

import { Panel } from "../shared/components/Panel";
import {
  useListPoliciesQuery,
  type RuntimePolicy,
  type PolicyLifecycle,
} from "../policy/policyApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function lifecycleTone(lc: PolicyLifecycle): ConsoleTone {
  switch (lc) {
    case "draft":
      return "neutral";
    case "validated":
    case "simulated":
      return "info";
    case "approved":
    case "published":
      return "success";
    case "superseded":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

const LIFECYCLE_LABELS: Record<PolicyLifecycle, string> = {
  draft: "Draft",
  validated: "Validated",
  simulated: "Simulated",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
  revoked: "Revoked",
};

// ── Component ────────────────────────────────────────────────────────────────

export function WorkloadPolicyTab({ workloadId }: { workloadId: string }) {
  const navigate = useNavigate();
  const { data: allPolicies = [], isLoading } = useListPoliciesQuery();

  // Client-side filter: for now show all policies.  Once the backend
  // exposes a workload-scoped endpoint we will filter by target here.
  const policies = useMemo<RuntimePolicy[]>(() => {
    // TODO: filter by workloadId once backend supports policy-target mapping
    void workloadId;
    return allPolicies;
  }, [allPolicies, workloadId]);

  if (isLoading) {
    return (
      <Panel title="Applicable Policies">
        <p className="py-8 text-center text-xs text-(--color-text-muted)">Loading policies...</p>
      </Panel>
    );
  }

  if (policies.length === 0) {
    return (
      <Panel
        title="Applicable Policies"
        count="0"
        actions={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate("/iga/policies/new")}
          >
            <Plus className="size-3.5" />
            Create Policy
          </Button>
        }
      >
        <div className="py-10 text-center">
          <p className="text-sm text-(--color-text-muted)">
            No runtime policies are currently applicable to this workload.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => navigate("/iga/policies/new")}
          >
            Create your first policy
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Applicable Policies"
      count={`${policies.length} ${policies.length === 1 ? "policy" : "policies"}`}
      actions={
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate("/iga/policies/new")}
        >
          <Plus className="size-3.5" />
          Create Policy
        </Button>
      }
      flush
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {policies.map((policy) => (
          <li key={policy.id}>
            <Link
              to={`/iga/policies/${policy.id}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-(--color-surface-subtle)"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-5 text-(--color-text)">
                  {policy.name}
                </p>
                <p className="mt-0.5 text-xs text-(--color-text-muted)">
                  Revision v{policy.current_draft_revision}
                </p>
              </div>

              <StatusBadge tone={lifecycleTone(policy.lifecycle)}>
                {LIFECYCLE_LABELS[policy.lifecycle] ?? policy.lifecycle}
              </StatusBadge>

              <ArrowRight className="size-4 shrink-0 text-(--color-text-muted)" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
