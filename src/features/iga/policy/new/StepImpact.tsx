/**
 * Step 2 — Impact and owners (SPEC-iga-phase3-policy.md §9.3 S3): what the
 * change does, how AWS is changed, who runs as each role, which
 * resource-policy routes the removal does not reach, and which owners will be
 * asked and by when.
 *
 * Wording rules (§3.4, §9.7): a service with a route that remains is
 * "excluded from the role's IAM permissions, but still reachable"; a removal
 * is never described as a revocation of a grant ("Nothing is granted"; the
 * grants stay declared); a role with no boundary gets AuthSec's boundary, a
 * role with its own boundary gets whatever the compiled plan says (shown after
 * submit), because AuthSec does not know which case applies until it reads AWS.
 */

import { Link } from "react-router-dom";

import { useGetGovOwnersQuery, useGetGovSettingsQuery, type GovResolvedOwner } from "@/app/api/igaPolicyReadsApi";
import { StatusBadge } from "@/components/console/status";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { PolicyLoadFailure, classifyPolicyError, humanize, plural, serviceList } from "../shared";
import { CodeBlock } from "../plans/CodeBlock";
import { arnTail, prettyJson, routeText } from "../plans/planCopy";
import { R1A_SCOPE, daysWord, routeRemains, routeStateSentence } from "./copy";
import type { RoleInfo, StepProps } from "./flow";
import { excludeOnlyDocument } from "./intentEdit";

function ownerWords(o: GovResolvedOwner): string {
  const of = o.owner_of.map((x) => (x.object_kind === "workload" && x.name ? `owner of ${x.name}` : "owner of the role"));
  return [...new Set(of)].join(" · ");
}

function RoleOwners({ ws, role }: { ws: string; role: RoleInfo }) {
  const q = useGetGovOwnersQuery({ ws, object_kind: "identity_account", object_id: role.subject.identity_account_id });
  const failure = classifyPolicyError(q.error);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-(--color-text-muted)">{role.name}</p>
      {q.isLoading ? (
        <p role="status" className="text-xs text-(--color-text-muted)">
          Looking up owners…
        </p>
      ) : failure ? (
        <PolicyLoadFailure failure={failure} subject="the owners" onRetry={() => void q.refetch()} />
      ) : q.data && q.data.resolved.length > 0 ? (
        <ul className="space-y-1">
          {q.data.resolved.map((o) => (
            <li key={o.user_id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[13px]">
              <span className="font-medium text-(--color-text)">{o.name || o.email || "A member"}</span>
              <span className="text-xs text-(--color-text-muted)">
                {ownerWords(o)}
                {!o.member ? " · no longer an active member, cannot be asked" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-(--color-warning-text)">No owner is recorded for this role or for what runs as it.</p>
      )}
      {q.data && !q.data.has_accountable ? (
        <p className="text-xs text-(--color-warning-text)">
          No accountable owner exists, so the review cannot complete.{" "}
          <Link to="/iga/policy/findings?kind=missing_owner" className="font-medium underline">
            Assign an owner
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function StepImpact({ ws, session, intent, roles }: StepProps) {
  const settings = useGetGovSettingsQuery({ ws });
  const rec = session.snapshot?.recommendation;
  const removed = intent.remove.map((r) => r.service);
  const clean = intent.remove.filter((r) => !routeRemains(r) && r.route_usage !== "confirm_required");
  const withRoute = intent.remove.filter((r) => routeRemains(r) || r.route_usage === "confirm_required");
  const predates = intent.remove.filter((r) => r.grant_age_basis === "predates_observation");
  const affected = [...new Set(roles.flatMap((r) => r.consumers.map((c) => c.name)).filter(Boolean))];
  const routes = rec?.resource_policy_routes ?? [];
  const n = settings.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What changes">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-(--color-text)">
            {clean.length > 0 ? (
              <li>
                {plural(clean.length, "service")} removed for {affected.length > 0 ? affected.join(" and ") : roles.map((r) => r.name).join(" and ")} ({serviceList(clean.map((c) => c.service), 12)}).
              </li>
            ) : null}
            {withRoute.map((r) => (
              <li key={r.service}>{routeStateSentence(r)}</li>
            ))}
            <li>
              {plural(intent.retain.length, "service")} kept{intent.retain.length > 0 ? ` (${serviceList(intent.retain.map((r) => r.service), 8)})` : ""}.
            </li>
            <li>Nothing is granted. The change applies to running sessions immediately.</li>
          </ul>
          {predates.length > 0 || withRoute.length > 0 ? (
            <p className="mt-3 text-xs text-(--color-text-muted)">
              Owners must confirm:{" "}
              {[
                predates.length > 0 ? `${serviceList(predates.map((p) => p.service), 6)} existed before AuthSec's first scan and was not added recently` : "",
                withRoute.length > 0 ? `use of ${serviceList(withRoute.map((p) => p.service), 6)} through resource policies, which AWS's activity report does not cover` : "",
              ]
                .filter(Boolean)
                .join("; ")}
              .
            </p>
          ) : null}
          <Meta className="mt-2">{R1A_SCOPE}</Meta>
        </Panel>

        <Panel title="How AWS is changed">
          <div className="space-y-2 text-[13px] text-(--color-text)">
            <p>
              A permissions boundary owned by AuthSec, which excludes only the removed services and allows everything else. A boundary grants nothing, so it cannot take away access nobody selected.
            </p>
            <ul className="space-y-0.5 text-xs">
              {roles.map((r) => (
                <li key={r.subject.role_id}>
                  {r.name}: <span className="font-mono">AuthSecBoundary-{r.subject.role_id}</span> when the role has no boundary
                </li>
              ))}
            </ul>
            <p className="text-xs text-(--color-text-muted)">
              If a role already has a boundary AuthSec does not own, AuthSec never edits it in AWS. The plan compiled when you submit says whether it is narrowed in place or copied for this role, and that change is delivered by pull request or export.
            </p>
            <CodeBlock
              title="View the boundary document"
              text={prettyJson(excludeOnlyDocument(removed))}
              what="boundary document"
              note="The document for a role that has no boundary. The compiled plan shows the exact document for each role."
            />
            <p className="text-xs text-(--color-text-muted)">
              Undo is one step back to the role&apos;s state now. If it has no boundary, AuthSec&apos;s boundary is detached and deleted; otherwise it returns to the document it had. The undo plan is shown when you submit.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Who runs as these roles" description="Each is asked before anything changes.">
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.subject.role_id} className="space-y-1">
              <p className="text-xs font-medium text-(--color-text-muted)">
                {r.name}
                <span className="ml-2 font-normal">{arnTail(r.arn)}</span>
              </p>
              {r.consumers.length === 0 ? (
                <p className="text-[13px] text-(--color-text-muted)">AuthSec found no workload that runs as this role.</p>
              ) : (
                <ul className="space-y-0.5 text-[13px]">
                  {r.consumers.map((c) => (
                    <li key={`${c.workload_id}:${c.relationship}`}>
                      <span className="font-medium text-(--color-text)">{c.name || "A workload"}</span>
                      <span className="text-xs text-(--color-text-muted)"> · {humanize(c.runtime_kind).toLowerCase()} · {humanize(c.relationship).toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              )}
              {new Set(r.consumers.map((c) => c.workload_id)).size > 1 ? (
                <StatusBadge tone="warning">Shared role: {r.consumers.length} workloads</StatusBadge>
              ) : null}
              {r.resolved && r.resolved.consumers_unresolved > 0 ? (
                <p className="text-xs text-(--color-warning-text)">
                  {plural(r.resolved.consumers_unresolved, "more workload")} name this role but AuthSec could not resolve {r.resolved.consumers_unresolved === 1 ? "it" : "them"}; their owners cannot be asked.
                </p>
              ) : null}
            </div>
          ))}
          {roles.some((r) => new Set(r.consumers.map((c) => c.workload_id)).size > 1) ? (
            <Meta>A shared role changes for every workload that uses it. Every one&apos;s accountable owner is asked, and the role can only be the canary once they all acknowledge.</Meta>
          ) : null}
        </div>
      </Panel>

      <Panel title="Resource-policy routes" description="AWS's activity report covers access through the role's IAM policies only.">
        {routes.length === 0 && withRoute.every((r) => !r.routes?.length) ? (
          <p className="text-[13px] text-(--color-text-muted)">
            {intent.remove.some((r) => r.route_state && r.route_state !== "none_observed")
              ? "Some removals have routes AuthSec could not list here; the plan shows them."
              : "No resource policy was found that grants a removed service to these roles or their sessions."}
          </p>
        ) : routes.length > 0 ? (
          <ul className="space-y-2 text-[13px]">
            {routes.map((r, i) => (
              <li key={`${r.role_id}:${r.service}:${r.resource ?? r.form ?? ""}:${i}`} className="space-y-0.5">
                <p className="text-(--color-text)">{routeText(r)}</p>
                <p className="text-xs text-(--color-text-muted)">
                  {r.boundary_applies ? "The boundary limits this route." : "The boundary does not limit this route, so the service stays reachable through it."}
                  {roles.length > 1 ? ` Role: ${roles.find((x) => x.subject.role_id === r.role_id)?.name ?? r.role_id}.` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {withRoute.flatMap((r) =>
              (r.routes ?? []).map((rt, i) => (
                <li key={`${r.service}:${i}`}>
                  {r.service}: {rt.resource ? `the resource policy of ${arnTail(rt.resource)}` : `${humanize(rt.form ?? "resource policies").toLowerCase()}`}
                  {rt.principal ? ` (${humanize(rt.principal).toLowerCase()})` : ""}
                </li>
              )),
            )}
          </ul>
        )}
      </Panel>

      <Panel title="Owners who will be asked" description="Owners of each role, and the accountable owners of every workload that runs as it.">
        <div className="space-y-3">
          {roles.map((r) => (
            <RoleOwners key={r.subject.role_id} ws={ws} role={r} />
          ))}
        </div>
        <Facts className="mt-4 border-t border-(--color-border-subtle) pt-3">
          <Fact label="Review deadline">
            {n ? (
              <>
                {daysWord(n.owner_review_days)} after you submit.{" "}
                <Link to="/iga/policy/setup/settings" className="font-medium text-(--color-primary-text) hover:underline">
                  Change it in Setup
                </Link>
              </>
            ) : (
              "Set in Setup › Settings"
            )}
          </Fact>
          <Fact label="How they are asked">
            {n
              ? [
                  n.notifications.email_enabled ? "email" : "",
                  n.notifications.slack?.available && n.notifications.slack.status?.connected ? "Slack, for linked members" : "",
                  n.notifications.webhook_url ? "the workspace webhook" : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "no channel is on: owners would have to open the review themselves"
              : "by the channels set in Setup › Notifications"}
          </Fact>
        </Facts>
        <Meta className="mt-2">A deadline changes nothing: silence is not consent. An approver may record an exception for an owner who cannot answer.</Meta>
      </Panel>
    </div>
  );
}
