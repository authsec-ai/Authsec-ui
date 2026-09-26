/**
 * Identity › Permissions (§5.3): which policies grant what, each statement
 * separately.
 *
 * - Allow statements carry their grant; Deny statements are shown under
 *   their policy as restrictions, never as grants.
 * - A boundary policy is a limit, shown under Boundary, never as a grant.
 * - `NotResource` is an exclusion: "all resources except …", never a target.
 * - Activity is Access Advisor's, in its own words (§2.14.8): authenticated
 *   attempts, never "last used", and absence is never a reason to revoke.
 */

import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphIdentityPermissionsQuery,
  type IdentityDetail,
  type IdentityPermissions,
  type PolicyGroup,
  type StatementDetail,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DrawerSection } from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";

import { classifyGraphError } from "../shared/graphErrors";
import { POLICY_KIND_LABEL, REL_STATE_TONE, RESOURCE_KIND_LABEL, agoText, statementLabel } from "../shared/labels";
import { useGraphV2 } from "../shared/capabilities";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { ActionList } from "../shared/components/ActionList";
import { Fact, Facts } from "../shared/components/Panel";
import { viaLink } from "../shared/links";
import { TabBody } from "../shared/components/ObjectShell";

type From = { ref: IdentityDetail["ref"]; name: string };

function Statement({ s, from, changesHref }: { s: StatementDetail; from: From; changesHref: string }) {
  const positive = s.targets.filter((t) => t.mode === "resource");
  const excluded = s.targets.filter((t) => t.mode === "not_resource");
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={s.effect === "deny" ? "warning" : "neutral"}>{s.effect === "deny" ? "Deny" : "Allow"}</StatusBadge>
        <span className="text-[13px] font-medium text-(--color-text)">{statementLabel(s)}</span>
        {s.state !== "current" ? <StatusBadge tone={REL_STATE_TONE[s.state]}>{s.state}</StatusBadge> : null}
        {(s.revision_count ?? 0) > 1 ? (
          <Link to={changesHref} className="text-xs text-(--color-primary-text) hover:underline">
            revised {(s.revision_count ?? 1) - 1} {s.revision_count === 2 ? "time" : "times"}
          </Link>
        ) : null}
      </div>
      <Facts>
        {s.actions.length ? (
          <Fact label="Actions">
            <ActionList actions={s.actions} />
          </Fact>
        ) : null}
        {s.not_actions.length ? (
          <Fact label="All actions except">
            <ActionList actions={s.not_actions} />
          </Fact>
        ) : null}
        {positive.length ? (
          <Fact label="Applies to">
            <span className="flex flex-col gap-1">
              {positive.map((t) => {
                const path = objectPath(t.ref);
                return (
                  <span key={t.ref} className="flex flex-wrap items-center gap-2">
                    {path ? (
                      <Link {...viaLink(path, from)} className="break-all rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-xs text-(--color-primary-text) hover:underline">
                        {t.text}
                      </Link>
                    ) : (
                      <code className="break-all rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-xs">{t.text}</code>
                    )}
                    <span className="text-xs text-(--color-text-muted)">{RESOURCE_KIND_LABEL[t.kind]}</span>
                  </span>
                );
              })}
            </span>
          </Fact>
        ) : null}
        {excluded.length ? (
          <Fact label="Except">
            <span className="font-mono text-xs">{excluded.map((t) => t.text).join(", ")}</span>
          </Fact>
        ) : null}
      </Facts>
      {s.condition ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-(--color-warning-text)">Conditions — recorded, not evaluated</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
            {JSON.stringify(s.condition, null, 2)}
          </pre>
        </details>
      ) : null}
      {s.effect === "deny" ? (
        <p className="text-xs text-(--color-text-muted)">A Deny restricts what other statements grant. It was not evaluated against them.</p>
      ) : s.grant ? (
        <ClaimFacts claim={s.grant} basis="declared" state={s.grant_state ?? undefined} />
      ) : null}
    </li>
  );
}

function Policy({ p, from, changesHref }: { p: PolicyGroup; from: From; changesHref: string }) {
  return (
    <section className="rounded-lg border border-(--color-border-subtle)">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-(--color-border-subtle) bg-(--color-surface-subtle)/50 px-4 py-2.5">
        <span className="text-[13px] font-semibold text-(--color-text)">{p.name}</span>
        <span className="text-xs text-(--color-text-muted)">
          {POLICY_KIND_LABEL[p.kind]} · {p.assignment.kind === "inline" ? "inline" : "attached"} · {p.statements.length}{" "}
          {p.statements.length === 1 ? "statement" : "statements"}
        </span>
        <span className="ml-auto">
          <ClaimFacts claim={p.assignment.claim} state={p.assignment.state} />
        </span>
      </header>
      <ul className="divide-y divide-(--color-border-subtle)">
        {p.statements.map((s) => (
          <Statement key={s.ref} s={s} from={from} changesHref={changesHref} />
        ))}
      </ul>
    </section>
  );
}

/** Why Access Advisor data is absent — no claim either way (§2.14.8). */
const ACTIVITY_NOT_COLLECTED: Record<string, string> = {
  retired: "The identity is no longer in the latest scan.",
  not_read: "Access Advisor was not read for this identity.",
  not_in_scan: "The latest scan did not include this identity's activity.",
  outside_sample: "This identity was outside the sample the scan read activity for.",
  report_not_read: "The Access Advisor report could not be read.",
  surface_not_reached: "The activity read did not complete for this account.",
  newer_scan_not_published: "A newer scan read it, but has not been published yet.",
};

function Activity({ activity }: { activity: IdentityPermissions["activity"] }) {
  if (activity.state === "not_collected" || !activity.services) {
    return (
      <DrawerSection label="Reported activity (Access Advisor)">
        <p className="text-sm text-(--color-text-muted)">
          Not collected. {ACTIVITY_NOT_COLLECTED[activity.reason ?? ""] ?? "No activity was read for this identity."} This says
          nothing about whether it is used.
        </p>
      </DrawerSection>
    );
  }
  return (
    <DrawerSection label="Reported activity (Access Advisor)">
      <p className="mb-2 text-xs text-(--color-text-muted)">
        {activity.tracking_note} AWS reports authenticated attempts, including requests that were then denied, and only
        for identity-based policies. No attempt reported is not a reason to revoke.
      </p>
      {activity.services.length ? (
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
          {activity.services.map((sv) => (
            <li key={sv.namespace} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="font-mono text-xs">{sv.namespace}</span>
              <span className="ml-auto text-xs text-(--color-text-muted)">
                {sv.last_authenticated_attempt
                  ? `Last authenticated attempt ${agoText(sv.last_authenticated_attempt)}`
                  : "No attempt reported in the available tracking period"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-(--color-text-muted)">No attempt reported in the available tracking period.</p>
      )}
    </DrawerSection>
  );
}

export function IdentityPermissionsTab({ ws, identity }: { ws: string; identity: IdentityDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const v2 = useGraphV2(ws);
  const args = { ws, rev, key: String(epoch), id: refId(identity.ref), ...(v2.available ? { graph: "v2" as const } : {}) };
  const q = useGetGraphIdentityPermissionsQuery(args, { skip: v2.loading });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentityPermissions", { ...args, rev: r }, d)),
  );
  const data = q.currentData?.data;
  const from: From = { ref: identity.ref, name: identity.name };
  const changesHref = `/iga/identities/${encodeURIComponent(refId(identity.ref))}/changes`;

  return (
    <TabBody ready={!!data} failure={failure} subject="permissions" onRetry={() => void q.refetch()} onRefresh={refresh}>
      {data ? (
        <div className="space-y-6">
          {data.truncated ? (
            <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
              This identity has more statements than one page shows; the policies below are not the whole set.
            </p>
          ) : null}
          <DrawerSection label="Policies">
            {data.policies.length ? (
              <div className="space-y-3">
                {data.policies.map((p) => (
                  <Policy key={p.assignment.claim} p={p} from={from} changesHref={changesHref} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-(--color-text-muted)">No policy is attached to or inline in this identity.</p>
            )}
          </DrawerSection>

          {data.inherited.map((g) => {
            const path = objectPath(g.group);
            return (
              <DrawerSection key={g.group} label={`Through group ${g.name}`}>
                <div className="mb-2">
                  <ClaimFacts claim={g.membership.claim} type="member of" state={g.membership.state} confirmedAt={g.membership.last_confirmed_at} />
                </div>
                {path ? (
                  <Link {...viaLink(path, from)} className="mb-2 inline-block text-xs font-semibold text-(--color-primary-text) hover:underline">
                    Open the group
                  </Link>
                ) : null}
                <div className="space-y-3">
                  {g.policies.map((p) => (
                    <Policy key={p.assignment.claim} p={p} from={from} changesHref={changesHref} />
                  ))}
                </div>
              </DrawerSection>
            );
          })}

          <DrawerSection label="Permissions boundary">
            <p className="text-sm">
              {data.boundary.policy ? (
                <>
                  <span className="font-medium">{data.boundary.policy.name}</span>{" "}
                  <span className="text-(--color-text-muted)">
                    limits what the policies above can grant. It is a limit, not a grant, and was not evaluated.
                  </span>
                </>
              ) : (
                <span className="text-(--color-text-muted)">None set.</span>
              )}
            </p>
          </DrawerSection>

          <Activity activity={data.activity} />
        </div>
      ) : null}
    </TabBody>
  );
}
