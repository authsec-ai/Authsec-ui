/**
 * Resolve an outcome AuthSec could not establish (SPEC-iga-phase3-policy.md
 * §8.1 step 3, §9.7 "Outcome unresolved"). Three choices through one route,
 * `POST /deployments/:id/resolve`, each with a mandatory reason:
 *
 *  - Re-read: AuthSec reads AWS and CloudTrail again (back to "outcome unknown"). For a
 *    deployment stuck `applying` it queues the deploy job again (409 `deploy_job_running` while one runs).
 *  - Accept what AWS shows: first call proposes a new version from what AWS
 *    holds now and opens owner review; the role stays held. Once that version
 *    is approved, a second call naming it hands the role over to its deployment.
 *  - Emergency undo (governance:emergency): the undo plan, run at once; AWS
 *    must still be in the state the undo starts from.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import { isResolveProposed, useResolveGovDeploymentMutation, type GovResolveRequest } from "@/app/api/igaPolicyDeploymentsApi";
import { Input } from "@/components/ui/input";

import { usePolicyAction } from "../shared";
import { ActionFrame, ReasonField } from "./ActionFrame";
import { deploymentHref } from "./deploymentModel";

type Choice = GovResolveRequest["action"];

const COPY: Record<Choice, { title: string; confirm: string; permission: "governance:enforce" | "governance:emergency" }> = {
  reread: { title: "Re-read AWS", confirm: "Re-read", permission: "governance:enforce" },
  accept_observed: { title: "Accept what AWS shows", confirm: "Accept what AWS shows", permission: "governance:enforce" },
  emergency_undo: { title: "Emergency undo", confirm: "Emergency undo", permission: "governance:emergency" },
};

export function ResolveDialog({
  deploymentId,
  policyId,
  choice,
  roleName,
  applying = false,
  open,
  onOpenChange,
}: {
  deploymentId: string;
  policyId?: string;
  choice: Choice;
  roleName: string;
  /** The deployment is stuck `applying` (no job moving it): a re-read queues its job again. */
  applying?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [resolve] = useResolveGovDeploymentMutation();
  const { run, pending, failure, clear } = usePolicyAction(COPY[choice].permission);
  const [reason, setReason] = useState("");
  const [handover, setHandover] = useState(false);
  const [versionNo, setVersionNo] = useState("");
  const [proposed, setProposed] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setHandover(false);
      setVersionNo("");
      setProposed(null);
      clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const no = Number.parseInt(versionNo, 10);
  const needsVersion = choice === "accept_observed" && handover;
  const versionOk = !needsVersion || (Number.isInteger(no) && no > 0);

  async function confirm() {
    const res = await run(() =>
      resolve({ id: deploymentId, action: choice, reason: reason.trim(), version_no: needsVersion ? no : undefined }),
    );
    if (!res) return;
    if (isResolveProposed(res)) {
      setProposed(typeof (res.version as { no?: unknown }).no === "number" ? ((res.version as { no: number }).no) : 0);
      toast.success("A version was proposed from what AWS shows");
      return;
    }
    if (choice === "reread") {
      toast.success(applying ? "The deployment was queued again" : "AuthSec will read AWS again");
      onOpenChange(false);
      return;
    }
    toast.success(choice === "emergency_undo" ? "Emergency undo queued" : "The role was handed to the approved version");
    onOpenChange(false);
    navigate(deploymentHref(res.id, policyId));
  }

  if (proposed !== null) {
    return (
      <ActionFrame
        open={open}
        onOpenChange={onOpenChange}
        title="Version proposed"
        description={`From what AWS shows on ${roleName} now.`}
      >
        <p>
          {proposed ? `Version ${proposed}` : "A new version"} was created from the state AWS holds now, and an owner review was opened. The role stays
          locked until that version is approved and its deployment takes over.
        </p>
        <p className="text-(--color-text-muted)">
          When it is approved, return here and choose Accept what AWS shows again with &ldquo;An approved version takes over&rdquo; and its number.
        </p>
        {policyId ? (
          <p>
            <Link to={`/iga/policy/policies/${encodeURIComponent(policyId)}`} className="font-medium text-(--color-primary-text) hover:underline">
              Open the policy
            </Link>
          </p>
        ) : null}
      </ActionFrame>
    );
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title={COPY[choice].title}
      description={`Deployment on ${roleName}`}
      confirmLabel={needsVersion ? "Hand over to the approved version" : COPY[choice].confirm}
      busyLabel="Working…"
      destructive={choice === "emergency_undo"}
      pending={pending}
      failure={failure}
      onConfirm={() => void confirm()}
      confirmDisabled={!reason.trim() || !versionOk}
    >
      {choice === "reread" ? (
        applying ? (
          <p>
            AuthSec queues this deployment&apos;s job again and continues from the last step it recorded; a step that may already have reached AWS is
            checked first, never sent twice. The server refuses while the job is still running. Use this only when the deployment has stopped moving.
          </p>
        ) : (
          <p>
            AuthSec reads AWS and CloudTrail again and decides whether its change reached AWS. If it still cannot tell, the deployment returns to
            &ldquo;Needs your decision&rdquo;. Nothing in AWS is changed.
          </p>
        )
      ) : null}

      {choice === "accept_observed" ? (
        <>
          <p>
            AuthSec treats what AWS holds now as the starting point. It does not change AWS. It proposes a new version from that state, which needs an
            owner review and an approval from someone other than you. The role stays locked until then.
          </p>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">Which step?</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="accept-step" checked={!handover} onChange={() => setHandover(false)} />
              Propose a version from what AWS shows now
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="accept-step" checked={handover} onChange={() => setHandover(true)} />
              An approved version takes over
            </label>
          </fieldset>
          {handover ? (
            <div className="space-y-1">
              <label htmlFor="resolve-version" className="text-xs font-medium">
                Version number (approved, proposed from this role&apos;s observed state)
              </label>
              <Input id="resolve-version" inputMode="numeric" value={versionNo} onChange={(e) => setVersionNo(e.target.value.replace(/\D/g, ""))} className="w-32" />
            </div>
          ) : null}
        </>
      ) : null}

      {choice === "emergency_undo" ? (
        <p className="rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-(--color-danger-text)">
          Runs this deployment&apos;s undo at once, without waiting for an approval, and takes over the locked role. It is recorded with your reason and
          notified. AuthSec reads AWS first and refuses if the role is not in the state the undo starts from.
        </p>
      ) : null}

      <ReasonField id="resolve-reason" value={reason} onChange={setReason} />
    </ActionFrame>
  );
}
