/**
 * Step 1 — Recommendation (SPEC-iga-phase3-policy.md §9.3 S3): what AuthSec
 * proposes to remove and what it keeps, and why. Removal is whole services
 * with a qualified "no attempt" basis; a service can be kept instead, with a
 * reason and a review date (an owner keep, intent.go:300-307), and an owner
 * keep can be undone. Services AuthSec keeps for its own reasons (used,
 * dependency, not reviewed) cannot be added to the removal here: nothing
 * qualifies them.
 *
 * The window is the workspace's evaluation window (Setup › Settings), not a
 * per-policy choice, and each removal's `qualified_days` is what the evidence
 * supports; compile re-justifies every removal, so lowering it would change
 * nothing. It is therefore shown, not offered as a control.
 */

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useGetGovSettingsQuery } from "@/app/api/igaPolicyReadsApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";

import { plural } from "../shared";
import { arnTail } from "../plans/planCopy";
import { AGE_HINT, R1A_SCOPE, removeWords, retainWords, routeRemains, warningText } from "./copy";
import { EvidenceLine } from "./EvidenceLine";
import type { StepProps } from "./flow";
import { restorableServices, reviewByProblem, withRemoved, withRetained } from "./intentEdit";

function AgeMark() {
  return (
    <span
      title={AGE_HINT}
      className="inline-flex items-center gap-1 rounded-full bg-(--color-warning-soft) px-1.5 py-0.5 text-[11px] font-semibold text-(--color-warning-text)"
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
      age<span className="sr-only">: {AGE_HINT}</span>
    </span>
  );
}

function KeepDialog({
  open,
  candidates,
  initial,
  onClose,
  onKeep,
}: {
  open: boolean;
  candidates: string[];
  initial: string[];
  onClose: () => void;
  onKeep: (services: string[], reason: string, reviewBy: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [touched, setTouched] = useState(false);
  const dateProblem = reviewByProblem(date);
  const missing = picked.length === 0 ? "Choose at least one service." : !reason.trim() ? "Say why it is kept." : dateProblem;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keep a service</DialogTitle>
          <DialogDescription>
            A kept service is left unchanged by this policy; other AWS controls can still deny it. An owner keep needs a reason and a date when it is reviewed again; owners and approvers see both.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[13px]">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-(--color-text-muted)">Services to keep</legend>
            {candidates.length === 0 ? <p className="text-xs text-(--color-text-muted)">Nothing is left to keep.</p> : null}
            {candidates.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <Checkbox
                  checked={picked.includes(s)}
                  onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, s] : p.filter((x) => x !== s)))}
                />
                {s}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-(--color-text-muted)">Why is it kept?</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="quarterly reconciliation job" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-(--color-text-muted)">Review by</span>
            <Input type="date" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} />
          </label>
          {touched && missing ? (
            <p role="alert" className="text-xs text-(--color-danger-text)">
              {missing}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (!missing) onKeep(picked, reason, date);
            }}
          >
            Keep {picked.length > 0 ? plural(picked.length, "service") : "services"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StepRecommend({ ws, session, intent, onIntent, roles, rolesLoading, baseline }: StepProps) {
  const [keeping, setKeeping] = useState<string[] | null>(null);
  const settings = useGetGovSettingsQuery({ ws });
  const rec = session.snapshot?.recommendation;
  const nameOfRole = (id: string) => roles.find((r) => r.subject.role_id === id)?.name ?? id;
  const restorable = new Set(restorableServices(intent, baseline));
  const windowDays = intent.remove.length > 0 ? Math.min(...intent.remove.map((r) => r.qualified_days)) : null;
  const longest = intent.remove.length > 0 ? Math.max(...intent.remove.map((r) => r.qualified_days)) : null;
  const anyAge = intent.remove.some((r) => r.grant_age_basis === "predates_observation");
  const context = rec?.context;
  const fromEdge = !!context && context.object_kind !== "workload";
  const independent = rec?.independent_grants ?? [];

  return (
    <div className="space-y-4">
      <EvidenceLine roles={roles} loading={rolesLoading} />

      {fromEdge && independent.length > 0 ? (
        <DecisionBanner
          tone="info"
          title="You started from one grant, but the change is about the role"
          body={
            <>
              You started from {context!.policy_arn ? `a grant in ${arnTail(context!.policy_arn)}` : `a ${context!.object_kind}`}.{" "}
              {independent
                .map((g) => `${g.services.join(", ")} ${g.services.length === 1 ? "is" : "are"} also granted by ${arnTail(g.policy_arn)} (${g.assignment_kind}) on ${nameOfRole(g.role_id)}`)
                .join("; ")}
              . The change removes {plural(intent.remove.length, "service")} for the role whichever policy grants {intent.remove.length === 1 ? "it" : "them"}. The original grants remain declared; the boundary restricts these services.
            </>
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Remove" count={intent.remove.length} description="Whole services with no attempt reported in the window.">
          {intent.remove.length === 0 ? (
            <p className="text-[13px] text-(--color-text-muted)">Nothing is left to remove. Every service was kept; use Remove again, or go back and start from a different role.</p>
          ) : (
            <ul className="divide-y divide-(--color-border-subtle)">
              {intent.remove.map((r) => (
                <li key={r.service} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                  <Checkbox
                    id={`rm-${r.service}`}
                    checked
                    aria-label={`Remove ${r.service}. Uncheck to keep it.`}
                    onCheckedChange={() => setKeeping([r.service])}
                  />
                  <label htmlFor={`rm-${r.service}`} className="font-medium text-(--color-text)">
                    {r.service}
                  </label>
                  <span className="text-xs text-(--color-text-muted)">{removeWords(r)}</span>
                  {r.grant_age_basis === "predates_observation" ? <AgeMark /> : null}
                  {routeRemains(r) ? (
                    <span className="text-xs font-medium text-(--color-warning-text)">excluded, a route remains</span>
                  ) : r.route_usage === "confirm_required" ? (
                    <span className="text-xs font-medium text-(--color-warning-text)">owners confirm routes</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Keep" count={intent.retain.length} description="Unchanged by this proposal. Existing AWS policies and constraints still determine access.">
          {intent.retain.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">No retained services are listed in the available evidence. This does not establish that the role has no other access.</p> : null}
          <ul className="divide-y divide-(--color-border-subtle)">
            {intent.retain.map((r) => (
              <li key={r.service} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-[13px]">
                <span>
                  <span className="font-medium text-(--color-text)">{r.service}</span>
                  <span className="ml-2 text-xs text-(--color-text-muted)">{retainWords(r)}</span>
                </span>
                {r.basis === "owner" && restorable.has(r.service) ? (
                  <Button variant="ghost" size="sm" className="text-(--color-primary-text)" onClick={() => onIntent(withRemoved(intent, baseline, [r.service]))}>
                    Remove again
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="pt-2">
            <Button variant="outline" size="sm" disabled={intent.remove.length === 0} onClick={() => setKeeping([])}>
              Keep a service…
            </Button>
          </div>
        </Panel>
      </div>

      <div className="space-y-1.5 text-xs text-(--color-text-muted)">
        {windowDays !== null ? (
          <p>
            <span className="font-medium text-(--color-text)">Window:</span> {windowDays} days
            {longest !== null && longest !== windowDays ? ` (up to ${longest} for some services)` : ""}: the longest period AWS reports no attempt for every service listed to remove. AuthSec needs at least 30.
            {settings.data ? (
              <>
                {" "}
                The workspace evaluates the last {settings.data.default_window_days} days;{" "}
                <Link to="/iga/policy/setup/settings" className="font-medium text-(--color-primary-text) hover:underline">
                  change it in Setup
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
        {anyAge ? (
          <p>
            <span className="font-medium text-(--color-text)">age:</span> {AGE_HINT}
          </p>
        ) : null}
        <Meta>{R1A_SCOPE}</Meta>
        {(rec?.warnings ?? [])
          .filter((w) => !w.startsWith("age_unverified"))
          .map((w) => (
            <p key={w}>{warningText(w, nameOfRole)}</p>
          ))}
      </div>

      {keeping ? (
        <KeepDialog
          key={keeping.join(",")}
          open
          candidates={intent.remove.map((r) => r.service)}
          initial={keeping}
          onClose={() => setKeeping(null)}
          onKeep={(services, reason, reviewBy) => {
            onIntent(withRetained(intent, services, { reason, review_by: reviewBy }));
            setKeeping(null);
          }}
        />
      ) : null}
    </div>
  );
}
