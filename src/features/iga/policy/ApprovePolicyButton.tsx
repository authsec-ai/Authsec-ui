/**
 * One click approves a runtime policy.
 * The server still requires validate, then simulate, then approve.
 * This button runs those three calls and leaves publication alone.
 */

import { useState, type MouseEvent } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  useApprovePolicyMutation,
  useLazyGetPolicyQuery,
  useSimulatePolicyMutation,
  useValidatePolicyMutation,
  type PolicyLifecycle,
} from "./policyApi";

const APPROVABLE = new Set<PolicyLifecycle>(["draft", "validated", "simulated"]);

function apiMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const body = error as {
      error?: string;
      status?: number | string;
      data?: { error?: { message?: string } | string; message?: string };
    };
    const nested = body.data?.error;
    if (nested && typeof nested === "object" && nested.message) return nested.message;
    if (typeof nested === "string" && nested) return nested;
    if (typeof body.data?.message === "string" && body.data.message) return body.data.message;
    if (typeof body.error === "string" && body.error && body.error !== "TypeError: Failed to fetch") {
      return body.error;
    }
  }
  return "Could not approve the policy. Reload the page and try again.";
}

export function ApprovePolicyButton({
  policyId,
  lifecycle,
  etag,
}: {
  policyId: string;
  lifecycle: PolicyLifecycle;
  etag?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [loadPolicy] = useLazyGetPolicyQuery();
  const [validatePolicy] = useValidatePolicyMutation();
  const [simulatePolicy] = useSimulatePolicyMutation();
  const [approvePolicy] = useApprovePolicyMutation();

  if (!APPROVABLE.has(lifecycle)) return null;

  const approve = async (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setBusy(true);
    try {
      let currentEtag = etag ?? "";
      let state = lifecycle;
      if (!currentEtag) {
        const loaded = await loadPolicy(policyId).unwrap();
        currentEtag = loaded.etag;
        state = loaded.policy.lifecycle;
      }
      if (!APPROVABLE.has(state)) {
        toast.success("This policy is already approved.");
        return;
      }
      if (state === "draft") {
        const validated = await validatePolicy({ id: policyId, etag: currentEtag }).unwrap();
        currentEtag = validated.etag || currentEtag;
      }
      const simulated = await simulatePolicy({ id: policyId, etag: currentEtag }).unwrap();
      currentEtag = simulated.etag || currentEtag;
      await approvePolicy({
        id: policyId,
        etag: currentEtag,
        revision_hash: simulated.revision_hash,
        simulation_id: simulated.simulation_id,
        target_digest: simulated.target_digest,
        reason: "Approved in the console",
      }).unwrap();
      toast.success("Policy approved.");
    } catch (error) {
      toast.error(apiMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" size="sm" className="gap-1.5" disabled={busy} onClick={approve}>
      <CheckCircle2 className="size-4" />
      {busy ? "Approving..." : "Approve"}
    </Button>
  );
}
