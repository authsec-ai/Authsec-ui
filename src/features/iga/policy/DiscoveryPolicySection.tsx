/**
 * What an identity or workload page says about policy once the policy product
 * is on (SPEC-iga-phase3-policy.md §9.4): its findings, its owners and the one
 * way in — "Right-size this role", resolved server-side by identity, never from
 * a loaded row. Renders nothing at all while the product is off, so Discovery is
 * unchanged on a backend that predates it.
 */

import { Panel } from "@/features/iga/shared/components/Panel";

import { CreatePolicyAction } from "./findings/CreatePolicyAction";
import { ObjectFindingsPanel } from "./findings/ObjectFindingsPanel";
import { ObjectOwnersPanel } from "./findings/ObjectOwnersPanel";
import { usePolicyCapabilities } from "./shared";

export function IdentityPolicySection({ ws, identityId }: { ws: string; identityId: string }) {
  const caps = usePolicyCapabilities(ws);
  if (caps.state !== "on") return null;
  return (
    <>
      <Panel
        title="Policy"
        description="Restrict whole AWS services this role does not use. Owners are asked first, and nothing is applied without an approval."
        actions={<CreatePolicyAction objectId={identityId} label="Right-size this role" />}
      >
        <p className="text-[13px] text-(--color-text-muted)">
          Each change is previewed with who it affects, then verified in AWS afterwards.
        </p>
      </Panel>
      <ObjectFindingsPanel ws={ws} identityId={identityId} />
      <ObjectOwnersPanel ws={ws} objectKind="identity_account" objectId={identityId} />
    </>
  );
}

export function WorkloadPolicySection({ ws, workloadId }: { ws: string; workloadId: string }) {
  const caps = usePolicyCapabilities(ws);
  if (caps.state !== "on") return null;
  return (
    <>
      <ObjectFindingsPanel ws={ws} workloadId={workloadId} />
      <ObjectOwnersPanel ws={ws} objectKind="workload" objectId={workloadId} />
    </>
  );
}
