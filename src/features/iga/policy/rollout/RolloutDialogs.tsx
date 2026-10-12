/**
 * The rollout's confirm dialogs (SPEC-iga-phase3-policy.md §7.5, §8.6): start
 * (observation, then canary), expand (with the not-available gates the approver
 * accepts, which gate and why), pause and resume (a reason each). Each says what
 * happens and keeps the server's refusal inline; `409 gates_not_passed` lists
 * the gates that failed.
 */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useExpandGovRolloutMutation,
  usePauseGovRolloutMutation,
  useResumeGovRolloutMutation,
  useStartGovRolloutMutation,
  type GovCanaryGate,
  type GovGateResult,
  type GovGatesNotPassedDetail,
} from "@/app/api/igaPolicyDeploymentsApi";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { StateChip, usePolicyAction } from "../shared";
import { ActionFrame, ReasonField } from "../deployments/ActionFrame";
import { GATE_WORDS, gateLabel, gateOutcome, reasonWords } from "../deployments/deploymentModel";

/* ---------------------------------- start ---------------------------------- */

export function StartDialog({
  policyId,
  variant,
  canaryRole,
  open,
  onOpenChange,
}: {
  policyId: string;
  /** `observe`: first start, no rollout yet. `canary`: observation is complete and approved. */
  variant: "observe" | "canary";
  canaryRole?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [start] = useStartGovRolloutMutation();
  const { run, pending, failure, clear } = usePolicyAction("governance:enforce");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
      clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    const res = await run(() => start({ policyId, reason: reason.trim() || undefined }));
    if (res) {
      toast.success(variant === "observe" ? "Observation started" : "Canary started");
      onOpenChange(false);
    }
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title={variant === "observe" ? "Start the rollout" : "Start the canary"}
      description={variant === "observe" ? "Begin observing before anything changes." : `Apply the approved change to ${canaryRole ?? "the canary role"} first.`}
      confirmLabel={variant === "observe" ? "Start observation" : "Start canary"}
      busyLabel="Starting…"
      pending={pending}
      failure={failure}
      onConfirm={() => void confirm()}
    >
      {variant === "observe" ? (
        <>
          <p>
            AuthSec starts watching the roles&apos; activity. <strong>Nothing changes in AWS yet.</strong> If a service marked for removal is attempted
            during observation, the version goes back to draft.
          </p>
          <p className="text-(--color-text-muted)">
            Observation ends when the observation period has passed and every role has an activity report generated after the cut-off shown on the
            rollout. The version must be in review or approved, and the owner review complete.
          </p>
        </>
      ) : (
        <>
          <p>
            AuthSec creates the deployment for {canaryRole ?? "the canary role"}. When AuthSec applies it, this changes AWS now: a permissions boundary
            is attached. With pull request or export delivery it prepares the change for your pipeline instead.
          </p>
          <p className="text-(--color-text-muted)">The other roles are not touched until the canary&apos;s gates pass and someone expands the rollout.</p>
        </>
      )}
      <ReasonField id="rollout-start-reason" value={reason} onChange={setReason} required={false} />
    </ActionFrame>
  );
}

/* --------------------------------- pause / resume --------------------------------- */

export function ReasonDialog({
  policyId,
  mode,
  open,
  onOpenChange,
}: {
  policyId: string;
  mode: "pause" | "resume";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pause] = usePauseGovRolloutMutation();
  const [resume] = useResumeGovRolloutMutation();
  const { run, pending, failure, clear } = usePolicyAction("governance:enforce");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
      clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    const res = await run(() => (mode === "pause" ? pause({ policyId, reason: reason.trim() }) : resume({ policyId, reason: reason.trim() })));
    if (res) {
      toast.success(mode === "pause" ? "Rollout paused" : "Rollout resumed");
      onOpenChange(false);
    }
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "pause" ? "Pause the rollout" : "Resume the rollout"}
      description={mode === "pause" ? "Stop it moving to the next stage." : "Let it continue from where it paused."}
      confirmLabel={mode === "pause" ? "Pause" : "Resume"}
      busyLabel="Working…"
      pending={pending}
      failure={failure}
      onConfirm={() => void confirm()}
      confirmDisabled={!reason.trim()}
    >
      <p>
        {mode === "pause"
          ? "No further role is changed while it is paused. Deployments already under way finish; nothing is undone."
          : "The rollout returns to the stage it paused in, and its gates are evaluated again. A gate that failed must be fixed first."}
      </p>
      <ReasonField id="rollout-reason" value={reason} onChange={setReason} />
    </ActionFrame>
  );
}

/* ---------------------------------- expand ---------------------------------- */

export function ExpandDialog({
  policyId,
  gates,
  accepted,
  remainingRoles,
  open,
  onOpenChange,
}: {
  policyId: string;
  /** The canary's gates as last evaluated. */
  gates: GovGateResult[];
  /** Gates an approver already accepted. */
  accepted: GovCanaryGate[];
  /** How many roles are not the canary; 0 for a single-role policy. */
  remainingRoles: number | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [expand] = useExpandGovRolloutMutation();
  const { run, pending, failure, clear } = usePolicyAction("governance:enforce");
  const [accept, setAccept] = useState<Partial<Record<GovCanaryGate, string>>>({});
  const [reason, setReason] = useState("");

  const acceptable = gates.filter((g) => g.outcome === "not_available" && !accepted.includes(g.gate));
  const open_ = gates.filter((g) => (g.outcome === "failed" || g.outcome === "awaiting_evidence" || g.outcome === "") && !accepted.includes(g.gate));
  const picked = (Object.keys(accept) as GovCanaryGate[]).filter((g) => accept[g] !== undefined);
  const missingReason = picked.some((g) => !(accept[g] ?? "").trim());
  const single = remainingRoles === 0;

  useEffect(() => {
    if (!open) {
      setAccept({});
      setReason("");
      clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    const res = await run(() =>
      expand({
        policyId,
        accept_not_available: picked.map((g) => ({ gate: g, reason: (accept[g] ?? "").trim() })),
        reason: reason.trim() || undefined,
      }),
    );
    if (res) {
      toast.success(single ? "Rollout completed" : "Rollout expanded");
      onOpenChange(false);
    }
  }

  const detail = failure?.code === "gates_not_passed" ? (failure.detail as GovGatesNotPassedDetail) : undefined;

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title={single ? "Complete the rollout" : "Expand to the remaining roles"}
      description="The canary's gates are checked again when you confirm."
      confirmLabel={picked.length > 0 ? `Accept ${picked.length === 1 ? "this gate" : `${picked.length} gates`} and ${single ? "complete" : "expand"}` : single ? "Complete" : "Expand"}
      busyLabel="Working…"
      pending={pending}
      failure={failure}
      failureExtra={
        detail?.gates && detail.gates.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {detail.gates.map((g) => (
              <li key={g.gate} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{gateLabel(g.gate)}</span>
                <StateChip state={gateOutcome(g.outcome)} />
                {g.reason ? <span>{reasonWords(g.reason)}</span> : null}
              </li>
            ))}
          </ul>
        ) : detail?.state ? (
          <p className="mt-1">The canary is in state {detail.state.replace(/_/g, " ")}; it must be applied first.</p>
        ) : null
      }
      onConfirm={() => void confirm()}
      confirmDisabled={missingReason}
    >
      <p>
        {single
          ? "This policy has one role, so its canary is the whole rollout. Completing it records the rollout as done once the gates pass."
          : `AuthSec creates a deployment for each of the ${remainingRoles ?? "remaining"} other roles. A role that cannot be deployed is reported by name, and the rollout then ends Partial, never as a success.`}
      </p>
      {open_.length > 0 ? (
        <p role="status" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-(--color-warning-text)">
          {open_.map((g) => gateLabel(g.gate)).join(", ")} {open_.length === 1 ? "has" : "have"} not passed. The request is refused until{" "}
          {open_.length === 1 ? "it does" : "they do"}; waiting for evidence is not a failure.
        </p>
      ) : null}

      {acceptable.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Gates AuthSec cannot evaluate</legend>
          <p className="text-xs text-(--color-text-muted)">
            An approver may accept each one, with a reason; the gate and the reason are recorded. This needs governance:approve and someone other than
            the version&apos;s author.
          </p>
          {acceptable.map((g) => {
            const on = accept[g.gate] !== undefined;
            return (
              <div key={g.gate} className="space-y-1 rounded-md border border-(--color-border-subtle) p-2.5">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) =>
                      setAccept((a) => {
                        const next = { ...a };
                        if (v === true) next[g.gate] = "";
                        else delete next[g.gate];
                        return next;
                      })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Accept: {gateLabel(g.gate)}</span>
                    <span className="block text-xs text-(--color-text-muted)">
                      {reasonWords(g.reason) || GATE_WORDS[g.gate]?.checks}
                    </span>
                  </span>
                </label>
                {on ? (
                  <Input
                    aria-label={`Reason for accepting ${gateLabel(g.gate)}`}
                    placeholder="Why this is acceptable (required)"
                    value={accept[g.gate] ?? ""}
                    onChange={(e) => setAccept((a) => ({ ...a, [g.gate]: e.target.value }))}
                    maxLength={500}
                  />
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ) : null}
      {picked.length > 0 ? (
        <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs">
          <p className="font-medium">You are accepting:</p>
          <ul className="list-disc pl-5">
            {picked.map((g) => (
              <li key={g}>
                {gateLabel(g)}: {(accept[g] ?? "").trim() || "reason needed"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ReasonField id="rollout-expand-reason" value={reason} onChange={setReason} required={false} />
    </ActionFrame>
  );
}
