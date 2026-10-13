/**
 * A drifted deployment (SPEC-iga-phase3-policy.md §8.8, §9.7): the boundary
 * AuthSec applied no longer matches AWS. AuthSec never reconciles on its own,
 * so the two choices are the operator's:
 *
 *   Re-apply     a new proposal with the same intent, compiled from AWS now,
 *                that needs its own owner review and approval
 *                (`POST /deployments/:id/reapply`, governance:author);
 *   Accept drift closes this deployment as it is; when AuthSec's boundary is
 *                no longer attached the control ends
 *                (`POST /deployments/:id/accept-drift`, governance:enforce).
 *
 * Neither writes AWS. An accepted drift says who accepted it and why.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import { useAcceptGovDriftMutation, useReapplyGovDeploymentMutation, type GovDeploymentDetail } from "@/app/api/igaPolicyDeploymentsApi";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { humanize, usePolicyAction, usePolicyPermission } from "../shared";
import { policyHref } from "../policies/policyModel";
import { ActionFrame, ReasonField } from "./ActionFrame";

export function DriftPanel({
  detail,
  policyId,
  roleName,
  nameOf,
}: {
  detail: GovDeploymentDetail;
  policyId?: string;
  roleName: string;
  nameOf: (id: string | null | undefined) => string;
}) {
  const d = detail.deployment;
  const navigate = useNavigate();
  const author = usePolicyPermission("governance:author");
  const enforce = usePolicyPermission("governance:enforce");
  const [reapply] = useReapplyGovDeploymentMutation();
  const [accept] = useAcceptGovDriftMutation();
  const reapplying = usePolicyAction("governance:author");
  const accepting = usePolicyAction("governance:enforce");
  const [choice, setChoice] = useState<"reapply" | "accept" | null>(null);
  const [reason, setReason] = useState("");

  const accepted = !!d.drift_accepted_at;
  const action = choice === "reapply" ? reapplying : accepting;

  function close() {
    setChoice(null);
    setReason("");
    reapplying.clear();
    accepting.clear();
  }

  async function confirm() {
    if (choice === "reapply") {
      const res = await reapplying.run(() => reapply({ id: d.id, reason: reason.trim() }));
      if (res) {
        toast.success("A new version was proposed");
        close();
        if (policyId) navigate(policyHref(policyId, "versions"));
      }
    } else if (choice === "accept") {
      const res = await accepting.run(() => accept({ id: d.id, reason: reason.trim() }));
      if (res) {
        toast.success(res.control_removed ? "Drift accepted; AuthSec no longer controls this role" : "Drift accepted");
        close();
      }
    }
  }

  return (
    <Panel title={accepted ? "Drift accepted" : "AWS no longer matches this change"}>
      <div className="space-y-3">
        <Facts>
          <Fact label="What changed">{d.state_reason ? humanize(d.state_reason) : "The boundary differs from what AuthSec applied."}</Fact>
          {accepted ? (
            <>
              <Fact label="Accepted">
                <Timestamp iso={d.drift_accepted_at} /> by {nameOf(d.drift_accepted_by) || "a member"}
              </Fact>
              <Fact label="Reason">{d.drift_accepted_reason}</Fact>
            </>
          ) : null}
        </Facts>
        {accepted ? (
          <Meta>
            AuthSec leaves {roleName} as it is in AWS and no longer reports this as needing attention. To restrict the role again, propose a new change.
          </Meta>
        ) : (
          <>
            <Meta>
              AuthSec never reconciles on its own. Re-apply proposes the same change again from what is in AWS now and needs its own review and
              approval. Accept drift keeps AWS as it is and closes this deployment; if AuthSec&apos;s boundary is no longer attached, AuthSec stops
              controlling the role.
            </Meta>
            <div className="flex flex-wrap items-center gap-2">
              {author.offered ? (
                <Button variant="outline" onClick={() => setChoice("reapply")}>
                  Re-apply…
                </Button>
              ) : null}
              {enforce.offered ? (
                <Button variant="outline" onClick={() => setChoice("accept")}>
                  Accept drift…
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ActionFrame
        open={choice !== null}
        onOpenChange={(o) => !o && close()}
        title={choice === "reapply" ? "Re-apply this change" : "Accept this drift"}
        description={
          choice === "reapply"
            ? `Propose the same change for ${roleName} again, from what is in AWS now.`
            : `Close this deployment of ${roleName} as it is.`
        }
        confirmLabel={choice === "reapply" ? "Propose again" : "Accept drift"}
        busyLabel="Working…"
        pending={action.pending}
        failure={action.failure}
        onConfirm={() => void confirm()}
        confirmDisabled={!reason.trim()}
      >
        {choice === "reapply" ? (
          <p>
            AuthSec compiles a new plan and opens an owner review. Nothing changes in AWS until that version is approved and deployed. The old approval
            covered a role that has since changed.
          </p>
        ) : (
          <p>
            AuthSec records that you accepted the difference and stops reporting it. It does not change AWS. If the boundary AuthSec applied is no longer
            attached to the role, AuthSec stops controlling the role and its findings follow what is in AWS now.
          </p>
        )}
        <ReasonField id="drift-reason" value={reason} onChange={setReason} />
      </ActionFrame>
    </Panel>
  );
}
