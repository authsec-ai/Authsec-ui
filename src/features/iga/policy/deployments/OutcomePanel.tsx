/**
 * Outcome unknown / unresolved (SPEC-iga-phase3-policy.md §8.1, §9.7): AuthSec
 * sent a change to AWS and did not get an answer. While open, the role is held:
 * no other change starts on it. `outcome_unknown` is settled by AuthSec at the
 * settle time and needs nothing from a person; `outcome_unresolved` needs a
 * choice (`POST /deployments/:id/resolve`): re-read, accept what AWS shows
 * (needs approval) or emergency undo (governance:emergency, hidden when the
 * server refused it).
 */

import { useState } from "react";

import type { GovDeploymentDetail } from "@/app/api/igaPolicyDeploymentsApi";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { StateChip, deploymentState, usePolicyPermission } from "../shared";
import { CLASSIFICATION_WORDS, HELD_ROLE_WORDS, clock, nextActionSentence, unknownAttemptAt } from "./deploymentModel";
import { ResolveDialog } from "./ResolveDialog";

export function OutcomePanel({ detail, policyId, roleName }: { detail: GovDeploymentDetail; policyId?: string; roleName: string }) {
  const d = detail.deployment;
  const enforce = usePolicyPermission("governance:enforce");
  const emergency = usePolicyPermission("governance:emergency");
  const [choice, setChoice] = useState<"reread" | "accept_observed" | "emergency_undo" | null>(null);

  const unresolved = d.state === "outcome_unresolved";
  const sentAt = unknownAttemptAt(detail.attempts);
  const settle = d.settle_after ? new Date(d.settle_after) : null;
  const settled = !settle || settle.getTime() <= Date.now();
  const artifact = detail.verifications.find((v) => v.dimension === "artifact");
  const shows = artifact?.dimension === "artifact" && "classification" in artifact.evidence ? artifact.evidence.classification : undefined;

  return (
    <Panel title={unresolved ? "This role is locked until you choose" : "Waiting for AuthSec to settle this"}>
      <div className="space-y-3">
        <p className="text-[13px]">{nextActionSentence(d, { unknownAt: sentAt })}</p>
        <Facts>
          <Fact label="State">
            <StateChip state={deploymentState(d.state)} />
          </Fact>
          {d.outcome_unknown_op ? <Fact label="Operation sent">{d.outcome_unknown_op}</Fact> : null}
          {sentAt ? <Fact label="Sent">{clock(sentAt)}</Fact> : null}
          {d.settle_after ? (
            <Fact label={unresolved ? "Settle time (passed)" : "AuthSec checks at"}>
              {clock(d.settle_after)}
              {!unresolved && !settled ? ": a request AWS did not answer may still arrive until then." : ""}
            </Fact>
          ) : null}
          {shows ? (
            <Fact label="AWS shows">
              {CLASSIFICATION_WORDS[shows.class] ?? shows.class} ({shows.visible} of {shows.total} changes visible)
            </Fact>
          ) : null}
        </Facts>
        <Meta>{HELD_ROLE_WORDS}</Meta>

        {unresolved && enforce.offered ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setChoice("reread")}>
              Re-read
            </Button>
            <Button onClick={() => setChoice("accept_observed")}>Accept what AWS shows</Button>
            {emergency.offered ? (
              <Button variant="destructive" onClick={() => setChoice("emergency_undo")}>
                Emergency undo
              </Button>
            ) : null}
          </div>
        ) : null}
        {!unresolved && settled && enforce.offered ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setChoice("reread")}>
              Re-read now
            </Button>
          </div>
        ) : null}
        {unresolved && !enforce.offered ? <Meta>Your role cannot resolve this. Ask someone who can enforce policy.</Meta> : null}
      </div>
      {choice ? (
        <ResolveDialog deploymentId={d.id} policyId={policyId} choice={choice} roleName={roleName} open onOpenChange={(o) => !o && setChoice(null)} />
      ) : null}
    </Panel>
  );
}

/**
 * A deployment `applying` that has stopped moving (SPEC review P1-5: a deploy
 * job that used up its attempts used to hold the role forever). `Resolve` takes
 * `applying` and re-queues the job; the server refuses while one is running
 * (409 `deploy_job_running`), so the button cannot double-send. Shown only to
 * people who can enforce policy.
 */
export function StuckApplyingPanel({ detail, policyId, roleName }: { detail: GovDeploymentDetail; policyId?: string; roleName: string }) {
  const enforce = usePolicyPermission("governance:enforce");
  const [open, setOpen] = useState(false);
  if (detail.deployment.state !== "applying" || !enforce.offered) return null;
  return (
    <Panel title="Not moving?" description="AuthSec checks every two minutes for a deployment that has no job and queues it again by itself.">
      <div className="space-y-2">
        <Meta>If this has stopped for longer than that, you can queue it again. A step AuthSec may already have sent to AWS is checked first, never sent twice.</Meta>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Queue it again…
        </Button>
      </div>
      {open ? <ResolveDialog deploymentId={detail.deployment.id} policyId={policyId} choice="reread" roleName={roleName} applying open onOpenChange={setOpen} /> : null}
    </Panel>
  );
}
