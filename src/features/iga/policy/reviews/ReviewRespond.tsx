/**
 * The owner's answer on the review page (SPEC-iga-phase3-policy.md §9.3 S4,
 * §7.4): **Looks fine** (acknowledge), **Keep a service…** (retain) and **This
 * will break something…** (object). One answer per owner; an owner can change
 * it while the review takes answers.
 *
 * Confirmations are the owner's statements, not AuthSec's: an age confirmation
 * says a grant is not recent, a route confirmation says the workload does not
 * use a resource-policy route. "Looks fine" is offered only with every
 * confirmation still needed from this owner ticked, because the server will
 * not let the version past the owner gate otherwise (409 age_unconfirmed /
 * route_unconfirmed). An acknowledgement is not a deployment approval.
 *
 * `retain` makes the server create the next version of the policy (the retained
 * services move to "keep") and withdraw the reviewed one, so this review closes:
 * the outcome says so, with the new version id.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  useRespondGovReviewMutation,
  type GovAgeConfirmation,
  type GovRespondRequest,
  type GovRespondResult,
  type GovRetainItem,
  type GovReviewResponseView,
  type GovReviewView,
  type GovRouteConfirmation,
  type GovRouteItem,
} from "@/app/api/igaPolicyAuthoringApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";

import { PolicyActionError, usePolicyAction, humanize } from "../shared";
import { ageBasisText, arnTail, dateTimeText, responseLabel, routeQuestion } from "./reviewCopy";

type Mode = "none" | "keep" | "object";

export interface RespondOutcome {
  kind: string;
  result: GovRespondResult;
}

interface AgeAsk {
  service: string;
  basis: string;
  /** No responding owner of the target has confirmed it. */
  pending: boolean;
  /** This owner confirmed it earlier. */
  mine: boolean;
  confirmedBy: string[];
}

interface RouteAsk {
  key: string;
  item: GovRouteItem;
  who: string;
  pending: boolean;
  mine: boolean;
  confirmedBy: string[];
}

const routeKey = (service: string, route: string) => `${service}\u001f${route}`;

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReviewRespond({
  review,
  me,
  minDays,
  onStale,
  onOutcome,
}: {
  review: GovReviewView;
  /** The viewer's own row: `my_response`, or their row among the owners when they have not been asked yet. */
  me: GovReviewResponseView | null;
  minDays?: number;
  onStale: () => void;
  /** The answer was recorded. The page keeps the outcome: a `retain` closes this review and unmounts the form. */
  onOutcome: (outcome: RespondOutcome) => void;
}) {
  const [respond] = useRespondGovReviewMutation();
  const { run, pending, failure, clear } = usePolicyAction();
  const [mode, setMode] = useState<Mode>("none");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [keeps, setKeeps] = useState<Record<string, { on: boolean; reason: string; reviewBy: string }>>({});
  const [comment, setComment] = useState("");

  // An owner who is not yet asked has no row of their own: the server will ask
  // them on answering, and refuses anything not requested of them.
  const myTargets = useMemo(() => (me ? new Set(me.owner_of.map((o) => o.target_id)) : null), [me]);
  const mineTarget = (id: string) => !myTargets || myTargets.has(id);

  const roleNames = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of review.targets) {
      const consumers = t.consumers.map((c) => c.name).filter(Boolean);
      out.set(t.target_id, consumers.length > 0 ? consumers.join(", ") : arnTail(t.role_arn));
    }
    return out;
  }, [review.targets]);

  const ageAsks = useMemo<AgeAsk[]>(() => {
    const seen = new Map<string, AgeAsk>();
    for (const a of review.requested.age_confirmations) {
      if (!mineTarget(a.target_id)) continue;
      const pendingHere = review.unconfirmed.age.some((u) => u.target_id === a.target_id && u.service === a.service);
      const prev = seen.get(a.service);
      if (prev) {
        prev.pending = prev.pending || pendingHere;
        continue;
      }
      seen.set(a.service, {
        service: a.service,
        basis: a.grant_age_basis,
        pending: pendingHere,
        mine: !!me?.age_confirmations.some((c) => c.service === a.service && c.confirmed),
        confirmedBy: review.responses
          .filter((r) => r.user_id !== me?.user_id && r.response && r.age_confirmations.some((c) => c.service === a.service && c.confirmed))
          .map((r) => r.name || "another owner"),
      });
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, me]);

  const routeAsks = useMemo<RouteAsk[]>(() => {
    const seen = new Map<string, RouteAsk>();
    for (const r of review.requested.route_confirmations) {
      if (!mineTarget(r.target_id)) continue;
      const k = routeKey(r.service, r.route);
      const pendingHere = review.unconfirmed.routes.some((u) => u.target_id === r.target_id && u.service === r.service && u.route === r.route);
      const prev = seen.get(k);
      if (prev) {
        prev.pending = prev.pending || pendingHere;
        continue;
      }
      seen.set(k, {
        key: k,
        item: r,
        who: roleNames.get(r.target_id) ?? "this role",
        pending: pendingHere,
        mine: !!me?.route_confirmations.some((c) => c.service === r.service && c.route === r.route && c.confirmed),
        confirmedBy: review.responses
          .filter(
            (x) =>
              x.user_id !== me?.user_id && x.response && x.route_confirmations.some((c) => c.service === r.service && c.route === r.route && c.confirmed),
          )
          .map((x) => x.name || "another owner"),
      });
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, me, roleNames]);

  // The services this version removes on roles this owner owns.
  const removable = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of review.targets) {
      if (!mineTarget(t.target_id)) continue;
      for (const r of t.removed) out.set(r.service, r.basis);
    }
    return [...out.keys()].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.targets, myTargets]);

  const isOn = (key: string, mineBefore: boolean) => ticked[key] ?? mineBefore;
  const needed = [
    ...ageAsks.filter((a) => a.pending || a.mine).map((a) => ({ key: `age:${a.service}`, on: isOn(`age:${a.service}`, a.mine) })),
    ...routeAsks.filter((r) => r.pending || r.mine).map((r) => ({ key: `route:${r.key}`, on: isOn(`route:${r.key}`, r.mine) })),
  ];
  const missing = needed.filter((n) => !n.on).length;

  const min = tomorrow();
  const keepRows = removable.map((svc) => ({ svc, ...(keeps[svc] ?? { on: false, reason: "", reviewBy: "" }) }));
  const chosen = keepRows.filter((k) => k.on);
  const keepsValid = chosen.length > 0 && chosen.every((k) => k.reason.trim() !== "" && k.reviewBy >= min);

  async function submit(body: GovRespondRequest) {
    const res = await run(() => respond({ id: review.id, body }));
    if (res) {
      onOutcome({ kind: body.response, result: res });
      setMode("none");
      setComment("");
    } else {
      // The review may have closed under us (409 review_closed): show its state.
      onStale();
    }
  }

  function acknowledge() {
    const age: GovAgeConfirmation[] = ageAsks.filter((a) => isOn(`age:${a.service}`, a.mine)).map((a) => ({ service: a.service, confirmed: true }));
    const routes: GovRouteConfirmation[] = routeAsks
      .filter((r) => isOn(`route:${r.key}`, r.mine))
      .map((r) => ({ service: r.item.service, route: r.item.route, confirmed: true }));
    void submit({ response: "acknowledge", age_confirmations: age, route_confirmations: routes });
  }

  function keep() {
    const items: GovRetainItem[] = chosen.map((k) => ({ service: k.svc, reason: k.reason.trim(), review_by: k.reviewBy }));
    void submit({ response: "retain", retain_items: items });
  }

  function object() {
    void submit({ response: "object", comment: comment.trim() });
  }

  const closing = (mode: Mode) => {
    clear();
    setMode((m) => (m === mode ? "none" : mode));
  };

  return (
    <Panel
      title={me?.response ? "Your answer" : "Your answer is needed"}
      description="An acknowledgement is not a deployment approval: a different person approves the version, and only after every owner has answered."
    >
      <div className="space-y-4">
        {me?.response ? (
          <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-[13px]">
            <p className="font-medium text-(--color-text)">
              {responseLabel(me.response)}
              {me.responded_at ? <span className="font-normal text-(--color-text-muted)"> · {dateTimeText(me.responded_at)}{me.responded_via ? ` via ${humanize(me.responded_via).toLowerCase()}` : ""}</span> : null}
            </p>
            {me.retain_items.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-(--color-text-muted)">
                {me.retain_items.map((r) => (
                  <li key={r.service}>
                    Keeps {r.service}: {r.reason} (review by {r.review_by})
                  </li>
                ))}
              </ul>
            ) : null}
            {me.comment ? <p className="mt-1 text-(--color-text-muted)">“{me.comment}”</p> : null}
            <p className="mt-1 text-xs text-(--color-text-muted)">You can change your answer below while the review is open.</p>
          </div>
        ) : null}

        {ageAsks.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-(--color-text)">
              Please confirm these were not added recently{minDays ? ` (AWS reports no attempt in the last ${minDays} days)` : ""}
            </legend>
            <Meta>A grant that predates AuthSec&apos;s first scan could have been added just before the quiet period, so AuthSec asks someone who knows.</Meta>
            {ageAsks.map((a) => {
              const id = `age-${a.service}`;
              return (
                <div key={a.service} className="flex items-start gap-2.5">
                  <Checkbox id={id} checked={isOn(`age:${a.service}`, a.mine)} onCheckedChange={(v) => setTicked((t) => ({ ...t, [`age:${a.service}`]: v === true }))} className="mt-0.5" />
                  <label htmlFor={id} className="text-[13px] leading-5 text-(--color-text)">
                    <span className="font-medium">{a.service}</span> was not added recently
                    <span className="block text-xs text-(--color-text-muted)">
                      {ageBasisText(a.basis)}
                      {!a.pending && a.confirmedBy.length > 0 ? ` · already confirmed by ${a.confirmedBy.join(", ")}` : ""}
                      {!a.pending && a.confirmedBy.length === 0 && a.mine ? " · confirmed by you" : ""}
                    </span>
                  </label>
                </div>
              );
            })}
          </fieldset>
        ) : null}

        {routeAsks.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-(--color-text)">AWS&apos;s activity report does not cover access through resource policies. Please confirm these routes are not used</legend>
            {routeAsks.map((r) => {
              const { question, note } = routeQuestion(r.item, r.who);
              const id = `route-${r.key}`;
              return (
                <div key={r.key} className="flex items-start gap-2.5">
                  <Checkbox id={id} checked={isOn(`route:${r.key}`, r.mine)} onCheckedChange={(v) => setTicked((t) => ({ ...t, [`route:${r.key}`]: v === true }))} className="mt-0.5" />
                  <label htmlFor={id} className="text-[13px] leading-5 text-(--color-text)">
                    {question}
                    <span className="block text-xs text-(--color-text-muted)">
                      {note}
                      {!r.pending && r.confirmedBy.length > 0 ? ` · already confirmed by ${r.confirmedBy.join(", ")}` : ""}
                    </span>
                  </label>
                </div>
              );
            })}
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={acknowledge} disabled={pending || missing > 0}>
            Looks fine
          </Button>
          <Button variant="outline" onClick={() => closing("keep")} disabled={pending || removable.length === 0} aria-expanded={mode === "keep"}>
            Keep a service…
          </Button>
          <Button variant="outline" onClick={() => closing("object")} disabled={pending} aria-expanded={mode === "object"}>
            This will break something…
          </Button>
        </div>
        {missing > 0 ? (
          <p className="text-xs text-(--color-text-muted)">
            Tick the {missing === 1 ? "confirmation" : `${missing} confirmations`} above to say &ldquo;Looks fine&rdquo;, or keep the service you cannot confirm.
          </p>
        ) : null}

        {mode === "keep" ? (
          <div className="space-y-3 rounded-md border border-(--color-border-subtle) p-3">
            <p className="text-[13px] font-medium text-(--color-text)">Which services must stay?</p>
            <Meta>
              Keeping a service makes AuthSec create a new version of the policy that keeps it, and closes this review. The new version is a draft until its author proposes it; owners are asked again then.
            </Meta>
            {keepRows.map((k) => (
              <div key={k.svc} className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id={`keep-${k.svc}`}
                    checked={k.on}
                    onCheckedChange={(v) => setKeeps((s) => ({ ...s, [k.svc]: { on: v === true, reason: k.reason, reviewBy: k.reviewBy } }))}
                  />
                  <label htmlFor={`keep-${k.svc}`} className="text-[13px] font-medium text-(--color-text)">
                    {k.svc}
                  </label>
                </div>
                {k.on ? (
                  <div className="grid gap-2 pl-6 sm:grid-cols-[1fr_11rem]">
                    <label className="text-xs text-(--color-text-muted)">
                      Why it must stay
                      <Input
                        value={k.reason}
                        onChange={(e) => setKeeps((s) => ({ ...s, [k.svc]: { on: true, reason: e.target.value, reviewBy: k.reviewBy } }))}
                        placeholder="The nightly batch reads this queue"
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-(--color-text-muted)">
                      Review this by
                      <Input
                        type="date"
                        min={min}
                        value={k.reviewBy}
                        onChange={(e) => setKeeps((s) => ({ ...s, [k.svc]: { on: true, reason: k.reason, reviewBy: e.target.value } }))}
                        className="mt-1"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={keep} disabled={pending || !keepsValid}>
                Keep and create a new version
              </Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
            {chosen.length > 0 && !keepsValid ? <p className="text-xs text-(--color-text-muted)">Each kept service needs a reason and a review date after today.</p> : null}
          </div>
        ) : null}

        {mode === "object" ? (
          <div className="space-y-2 rounded-md border border-(--color-border-subtle) p-3">
            <label className="text-[13px] font-medium text-(--color-text)" htmlFor="object-comment">
              What would break?
            </label>
            <Meta>Your objection blocks the version until you change your answer, an approver records an exception, or the author edits the version.</Meta>
            <Textarea id="object-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="The refund agent publishes to sns on every refund" />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={object} disabled={pending || comment.trim() === ""}>
                Object
              </Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <PolicyActionError failure={failure}>
          {failure?.code === "review_closed" && typeof failure.detail?.status === "string" ? (
            <p className="mt-1">This review is now {failure.detail.status}.</p>
          ) : null}
        </PolicyActionError>
      </div>
    </Panel>
  );
}

export function RespondOutcomeBanner({ outcome, policyId }: { outcome: RespondOutcome; policyId: string }) {
  const { kind, result } = outcome;
  if (result.new_version_id) {
    return (
      <DecisionBanner
        tone="success"
        title="Your answer was recorded and a new version was created"
        body={
          <>
            The services you keep move to &ldquo;keep&rdquo; in version <span className="font-mono text-xs">{result.new_version_id.slice(0, 8)}</span>, a draft on the policy. The
            version you reviewed was withdrawn, so this review is closed. The new version reaches approvers only when its author proposes it; owners are asked again then.{" "}
            <Link to={`/iga/policy/policies/${encodeURIComponent(policyId)}/versions`} className="font-medium underline">
              Open the policy&apos;s versions
            </Link>
          </>
        }
      />
    );
  }
  if (kind === "object") {
    return (
      <DecisionBanner
        tone="warning"
        title="Your objection was recorded"
        body="It blocks this version from being approved until you change your answer, an approver records an exception, or the author edits the version."
      />
    );
  }
  return (
    <DecisionBanner
      tone="success"
      title="Your answer was recorded"
      body={
        result.review_status === "complete"
          ? "Every owner has now responded. An approver decides separately whether the version is deployed; nothing changes in AWS from this answer."
          : "Other owners are still being asked. An approver decides separately whether the version is deployed; nothing changes in AWS from this answer."
      }
    />
  );
}
