import { Link } from "react-router-dom";
import { Shield, ExternalLink } from "lucide-react";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";
import { PolicyStatusBadge, EnforcementBadge, type EnforcementOverlay } from "@/features/iga/policy/PolicyStatusBadge";
import type { RolloutTarget } from "@/features/iga/policy/policyApi";

interface RuntimePolicyEnforcementCardProps {
  policyId: string;
  policyName: string;
  lifecycle: "draft" | "validated" | "simulated" | "approved" | "published" | "superseded" | "revoked";
  revision: number;
  mode?: string;
  rolloutPhase?: string;
  target?: RolloutTarget;
}

export function RuntimePolicyEnforcementCard({ policyId, policyName, lifecycle, revision, mode, rolloutPhase, target }: RuntimePolicyEnforcementCardProps) {
  const enforcementState: EnforcementOverlay = target?.state as EnforcementOverlay ?? "pending";

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          Runtime Policy
        </span>
      }
      actions={
        <Link to={`/iga/policies/${policyId}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
          View policy <ExternalLink className="size-3" />
        </Link>
      }
    >
      <Facts>
        <Fact label="Policy">{policyName}</Fact>
        <Fact label="Status"><PolicyStatusBadge lifecycle={lifecycle} /></Fact>
        <Fact label="Revision">{revision}</Fact>
        {mode && <Fact label="Mode">{mode}</Fact>}
        {rolloutPhase && <Fact label="Rollout">{rolloutPhase}</Fact>}
        {target && (
          <>
            <Fact label="Enforcement"><EnforcementBadge state={enforcementState} /></Fact>
            <Fact label="Controls">{target.controls_verified}/{target.controls_total} verified</Fact>
            {target.last_receipt_at && <Fact label="Last receipt">{new Date(target.last_receipt_at).toLocaleString()}</Fact>}
          </>
        )}
      </Facts>
    </Panel>
  );
}
