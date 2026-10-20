/**
 * What an identity or workload page says about policy once the policy product is
 * on. With the one access-policy feature there are no findings, owners or
 * right-sizing here: the single way in is to start an access policy for the role,
 * carrying the role into the create form (`/iga/policy/new?identity_account_id=`),
 * which resolves it server-side. Renders nothing at all while the product is off,
 * so Discovery is unchanged on a backend that predates it.
 */

import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";

import { usePolicyCapabilities } from "./shared";

export function IdentityPolicySection({ ws, identityId }: { ws: string; identityId: string }) {
  const caps = usePolicyCapabilities(ws);
  if (caps.state !== "on") return null;
  return (
    <Panel
      title="Policy"
      description="Block or allow access to an S3 bucket for this role for a set window. AuthSec changes IAM and AWS enforces it."
      actions={
        <Button asChild size="sm">
          <Link to={`/iga/policy/new?identity_account_id=${encodeURIComponent(identityId)}`}>New access policy</Link>
        </Button>
      }
    >
      <p className="text-[13px] text-(--color-text-muted)">
        Each change is previewed with who it affects, then verified in AWS afterwards.
      </p>
    </Panel>
  );
}

export function WorkloadPolicySection({ ws, workloadId }: { ws: string; workloadId: string }) {
  const caps = usePolicyCapabilities(ws);
  if (caps.state !== "on") return null;
  return (
    <Panel
      title="Policy"
      description="A workload has no policy of its own. An access policy changes the IAM role it runs as, and affects everything that runs as that role."
    >
      <p className="text-[13px] text-(--color-text-muted)">
        Open the role this workload runs as to start a policy for it.
      </p>
      {/* workloadId is kept in the signature so callers need not change; the role
          is chosen inside the create form. */}
      <span className="hidden">{workloadId}</span>
    </Panel>
  );
}
