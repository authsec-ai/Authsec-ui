/**
 * What the new-policy flow shows before there is a draft: the start screen
 * (no starting point named), the working line, a starting point that cannot be
 * used (with each key's reason, and no draft created), a failure, and a draft
 * that was already submitted. Opening the flow with a starting point creates
 * a draft policy, and every view here says so where it matters.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { GovResolvedTarget } from "@/app/api/igaPolicyReadsApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";

import { PolicyLoadFailure, type PolicyFailure, humanize, versionStatus } from "../shared";
import { targetName, targetProblem } from "./copy";
import { keyOfText } from "./entry";
import { SubmitFailure } from "./StepReview";
import { targetBlock, type Boot } from "./useDraftSession";

export const DRAFT_NOTE =
  "Opening this creates a draft policy. Nothing is sent to anyone and nothing changes in AWS until you submit it for owner review. You can leave and find the draft under Policy › Policies.";

export function StartScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const key = keyOfText(text);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel title="Right-size an AWS role" description="Start from a role AuthSec has scanned.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!key) return;
            navigate(`/iga/policy/new?template=right_size_services&key=${encodeURIComponent(text.trim())}`);
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-(--color-text-muted)">Role ARN or role id</span>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="arn:aws:iam::429418377036:role/RefundTaskRole"
              aria-invalid={touched && !key}
              aria-describedby="start-help"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p id="start-help" className={touched && !key ? "text-xs text-(--color-danger-text)" : "text-xs text-(--color-text-muted)"}>
            {touched && !key ? "Enter a role ARN (arn:aws:iam::<account>:role/<name>) or an AWS role id (AROA…)." : "AuthSec looks the role up itself, so any role in a scanned account works."}
          </p>
          <Button type="submit">Check the role</Button>
        </form>
        <p className="mt-3 text-xs text-(--color-text-muted)">{DRAFT_NOTE}</p>
      </Panel>
      <p className="text-[13px] text-(--color-text-muted)">
        To start from what AuthSec recommends, open{" "}
        <Link to="/iga/policy/findings" className="font-medium text-(--color-primary-text) hover:underline">
          Findings
        </Link>{" "}
        and choose Generate tighter policy on a role.
      </p>
    </div>
  );
}

export function WorkingLine({ what }: { what: string }) {
  return (
    <div role="status" className="space-y-1 text-sm text-(--color-text-muted)">
      <p>{what}</p>
      <p className="text-xs">{DRAFT_NOTE}</p>
    </div>
  );
}

function TargetRow({ t }: { t: GovResolvedTarget }) {
  const problem = targetProblem(t);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
      <div className="min-w-0">
        <p className="font-medium text-(--color-text)">{targetName(t)}</p>
        {problem ? (
          <p className="text-xs text-(--color-text-muted)">
            {problem.words}{" "}
            {problem.fix ? (
              <Link to={problem.fix.to} className="font-medium text-(--color-primary-text) underline">
                {problem.fix.label}
              </Link>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-(--color-text-muted)">Can be added.</p>
        )}
      </div>
      {problem ? <StatusBadge tone="warning">{problem.title}</StatusBadge> : <StatusBadge tone="success">Can be added</StatusBadge>}
    </li>
  );
}

export function BlockedView({ targets, canContinue, onContinue }: { targets: GovResolvedTarget[]; canContinue: boolean; onContinue: () => void }) {
  const ok = targets.filter((t) => targetBlock(t) === "ok");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <DecisionBanner
        tone="warning"
        title={ok.length === 0 ? "AuthSec cannot start a policy from this" : "Some of these cannot be added"}
        body="No draft was created. A role that is not supported, not found, ambiguous, not eligible or already controlled by a policy cannot be a target."
      />
      <Panel title="What AuthSec found" flush>
        <ul className="divide-y divide-(--color-border-subtle) px-4">
          {targets.map((t, i) => (
            <TargetRow key={`${i}:${targetName(t)}`} t={t} />
          ))}
        </ul>
      </Panel>
      <div className="flex flex-wrap gap-2">
        {canContinue ? <Button onClick={onContinue}>Continue with the {ok.length === 1 ? "role" : `${ok.length} roles`} that can be added</Button> : null}
        <Button variant="outline" asChild>
          <Link to="/iga/policy/findings">Back to Findings</Link>
        </Button>
      </div>
    </div>
  );
}

export function FailedView({
  boot,
  nameOf,
  onRetry,
}: {
  boot: Extract<Boot, { phase: "failed" }>;
  nameOf: (roleId: string) => string;
  onRetry: () => void;
}) {
  const f: PolicyFailure = boot.failure;
  if (boot.during === "create") {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {f.kind === "timeout" || f.kind === "failed" ? (
          <p className="text-sm font-medium text-(--color-text)">
            The request did not finish, so the draft may exist. Check{" "}
            <Link to="/iga/policy/policies" className="text-(--color-primary-text) underline">
              Policies
            </Link>{" "}
            before trying again.
          </p>
        ) : (
          <p className="text-sm font-medium text-(--color-text)">AuthSec refused to create the draft. Nothing was created.</p>
        )}
        <SubmitFailure failure={f} nameOf={nameOf} />
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <PolicyLoadFailure
        failure={f}
        subject={boot.during === "resolve" ? "the starting point" : "the draft"}
        onRetry={onRetry}
      />
    </div>
  );
}

export function SubmittedView({ boot }: { boot: Extract<Boot, { phase: "submitted" | "not_a_draft" }> }) {
  const id = encodeURIComponent(boot.policyId);
  if (boot.phase === "not_a_draft") {
    return (
      <DecisionBanner
        tone="info"
        title={`${boot.name} is not a right-size draft`}
        body="This flow edits drafts that restrict AWS services. Open the policy to see what it is."
        actionLabel="Open the policy"
        actionHref={`/iga/policy/policies/${id}`}
      />
    );
  }
  const status = versionStatus(boot.status).label.toLowerCase();
  return (
    <DecisionBanner
      tone="info"
      title={`${boot.name} was already submitted`}
      body={`Its current version is ${status}, so it is no longer a draft and cannot be edited here. ${humanize(boot.status) === "In review" ? "Owners are being asked; follow it in the rollout." : "Open the policy to continue, or to create a new version."}`}
      actionLabel="Open the rollout"
      actionHref={`/iga/policy/policies/${id}/rollout`}
      secondaryLabel="Open the policy"
      secondaryHref={`/iga/policy/policies/${id}`}
    />
  );
}
