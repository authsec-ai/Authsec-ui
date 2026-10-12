/**
 * Pause and Remove for one legacy agent policy (SPEC-iga-phase3-policy.md §9.5:
 * "confirmation names what the legacy reconciler will do next"). Pause disables
 * the policy (the reason is optional); Remove deletes it and needs a reason. Both
 * keep the server's refusal inline.
 */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import {
  usePauseLegacyAgentPolicyMutation,
  useRemoveLegacyAgentPolicyMutation,
  type LegacyAgentPolicyView,
} from "@/app/api/igaPolicySetupApi";
import { Textarea } from "@/components/ui/textarea";

import { usePolicyAction } from "../shared";
import { ActionDialog } from "../setup/ActionDialog";
import { whatHappensNext } from "./legacyModel";
import { LEGACY_ADMIN } from "./useLegacyAdmin";

function ReasonField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-(--color-text)">
        {label}
      </label>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} />
    </div>
  );
}

export function PauseLegacyPolicyDialog({ policy, onClose }: { policy: LegacyAgentPolicyView | null; onClose: () => void }) {
  const [pause] = usePauseLegacyAgentPolicyMutation();
  const action = usePolicyAction(LEGACY_ADMIN);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!policy) {
      setReason("");
      action.clear();
    }
    // `action.clear` is a fresh closure each render; the policy going away is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy]);

  async function confirm() {
    if (!policy) return;
    const res = await action.run(() => pause({ id: policy.id, reason }));
    if (res) {
      toast.success("Policy paused");
      onClose();
    }
  }

  return (
    <ActionDialog
      open={!!policy}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={policy ? `Pause ${policy.name}` : "Pause"}
      description="A legacy Kubernetes agent-lifecycle policy"
      confirmLabel="Pause policy"
      busyLabel="Pausing…"
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void confirm()}
      wide
    >
      {policy ? (
        <>
          <p>
            The legacy reconciler and its warning scheduler stop acting on this policy from their next pass. Nothing it already did is undone.
          </p>
          <p className="text-(--color-text-muted)">{whatHappensNext(policy)}</p>
          <p className="text-(--color-text-muted)">This console cannot turn a paused policy back on.</p>
          <ReasonField id="legacy-pause-reason" label="Reason (optional, kept in the audit trail)" value={reason} onChange={setReason} />
        </>
      ) : null}
    </ActionDialog>
  );
}

export function RemoveLegacyPolicyDialog({ policy, onClose }: { policy: LegacyAgentPolicyView | null; onClose: () => void }) {
  const [remove] = useRemoveLegacyAgentPolicyMutation();
  const action = usePolicyAction(LEGACY_ADMIN);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!policy) {
      setReason("");
      action.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy]);

  async function confirm() {
    if (!policy) return;
    const res = await action.run(() => remove({ id: policy.id, reason }));
    if (res) {
      toast.success("Policy removed");
      onClose();
    }
  }

  return (
    <ActionDialog
      open={!!policy}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={policy ? `Remove ${policy.name}` : "Remove"}
      description="A legacy Kubernetes agent-lifecycle policy"
      confirmLabel="Remove policy"
      busyLabel="Removing…"
      destructive
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void confirm()}
      confirmDisabled={!reason.trim()}
      wide
    >
      {policy ? (
        <>
          <p>
            The policy is deleted, so the legacy reconciler will not act on it again. Effects it already had are not undone, and the actions it
            recorded are kept.
          </p>
          <p className="text-(--color-text-muted)">{whatHappensNext(policy)}</p>
          <ReasonField id="legacy-remove-reason" label="Reason (required, kept in the audit trail)" value={reason} onChange={setReason} />
        </>
      ) : null}
    </ActionDialog>
  );
}
