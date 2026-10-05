/** Identity › Overview: what it is, where, and how much we know (§2.14.5). */

import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphIdentityPermissionsQuery,
  useGetGraphIdentityUsedByQuery,
  type GraphCoverageGap,
  type GraphRef,
  type IdentityDetail,
  type IdentityPermissions,
  type IdentityUsedBy,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DecisionBanner, StatusBadge } from "@/components/console/status";

import { discoveryHref } from "../discovery/urlState";
import { classifyGraphError } from "../shared/graphErrors";
import {
  DIRECT_BINDINGS_LABEL,
  DIRECT_BINDINGS_MEANING,
  IDENTITY_KIND_LABEL,
  RESOURCE_KIND_LABEL,
  RUNTIME_LABEL,
  accountWithId,
  agoText,
  countText,
  dayText,
} from "../shared/labels";
import { accountCoverageNote } from "../shared/lifecycle";
import { viaLink } from "../shared/links";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { shortResourceName } from "../shared/sketch";
import { DeclaredExamples, type ExampleLine } from "../shared/components/DeclaredExamples";
import { InlineState } from "../shared/components/InlineState";
import { NeighbourhoodSketch, type SketchEdge, type SketchNode } from "../shared/components/NeighbourhoodSketch";
import { CopyValue, Fact, Facts, Meta, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";

const SKETCH_SIDE = 3;

/** Statements with their effect stated, in policy order: the first lines the Permissions tab shows. */
function examplesOf(p: IdentityPermissions, limit = 3): ExampleLine[] {
  const boundary = !!p.boundary.policy;
  const out: ExampleLine[] = [];
  for (const policy of p.policies) {
    for (const s of policy.statements) {
      if (out.length >= limit) return out;
      const positive = s.targets.filter((t) => t.mode === "resource");
      out.push({
        key: s.ref,
        effect: s.effect,
        actions: s.actions,
        notActions: s.not_actions,
        target: positive.length ? `${positive[0].text}${positive.length > 1 ? ` and ${positive.length - 1} more` : ""}` : null,
        exclusions: s.targets.filter((t) => t.mode === "not_resource").map((t) => t.text),
        conditional: !!s.condition,
        // A boundary limits what Allow statements grant; it is stated on those lines only.
        boundary: boundary && s.effect === "allow",
      });
    }
  }
  return out;
}

/** The identity, the first workloads bound to it, and the first resources its Allow statements name — only what was read. */
function sketchOf(i: IdentityDetail, usedBy: IdentityUsedBy | undefined, perms: IdentityPermissions | undefined) {
  const root: SketchNode = {
    id: i.ref,
    label: i.name,
    kind: IDENTITY_KIND_LABEL[i.kind],
    category: "identity",
    icon: i.kind === "iam_user" ? "user" : i.kind === "iam_group" ? "group" : "role",
  };
  const edges: SketchEdge[] = [];
  const workloads: SketchNode[] = [];
  for (const w of usedBy?.workloads?.items ?? []) {
    if (workloads.length >= SKETCH_SIDE) break;
    if (workloads.some((n) => n.id === w.workload.ref)) continue;
    workloads.push({
      id: w.workload.ref,
      label: w.workload.name,
      kind: RUNTIME_LABEL[w.workload.runtime_kind],
      category: "workload",
      icon: "workload",
      to: objectPath(w.workload.ref) ?? undefined,
    });
    edges.push({ from: w.workload.ref, to: i.ref, label: w.type === "executes_as" ? "runs as" : "ECS agent uses" });
  }
  const targets: SketchNode[] = [];
  let drawable = 0;
  for (const policy of perms?.policies ?? [])
    for (const s of policy.statements) {
      if (s.effect !== "allow") continue;
      for (const t of s.targets) {
        if (t.mode !== "resource" || targets.some((n) => n.id === t.ref)) continue;
        drawable += 1;
        if (targets.length >= SKETCH_SIDE) continue;
        targets.push({
          id: t.ref,
          label: shortResourceName(t.text),
          kind: RESOURCE_KIND_LABEL[t.kind],
          category: t.kind === "external" ? "external" : "resource",
          icon: t.kind === "selector" ? "selector" : "resource",
          to: objectPath(t.ref) ?? undefined,
        });
        edges.push({ from: i.ref, to: t.ref, label: "declares" });
      }
    }
  const moreWorkloads = (usedBy?.workloads?.items.length ?? 0) > workloads.length || !!usedBy?.workloads?.next_cursor;
  const parts = [
    moreWorkloads ? `the first ${workloads.length} workloads bound to it` : null,
    drawable > targets.length || perms?.truncated ? `the first ${targets.length} resources its Allow statements name` : null,
  ].filter(Boolean);
  return {
    columns: [workloads, [root], targets],
    edges,
    rootId: i.ref,
    note: parts.length ? `Drawn: ${parts.join(" and ")}. The Used by and Permissions tabs list the rest.` : null,
  };
}

/** Who this role's trust policy names (incoming): declared trust, never a proven assumption. */
function TrustedPrincipals({ i, data, failure, pending, retry, refresh }: {
  i: IdentityDetail;
  data?: IdentityUsedBy;
  failure: ReturnType<typeof classifyGraphError>;
  pending: boolean;
  retry: () => void;
  refresh: () => void;
}) {
  if (failure) return <InlineState failure={failure} subject="the trusted principals" onRetry={retry} onRefresh={refresh} />;
  if (pending || !data) return <span className="text-(--color-text-muted)">Loading…</span>;
  const sec = data.principals;
  const from = { ref: i.ref, name: i.name };
  if (!sec?.items.length)
    return <span className="text-(--color-text-muted)">Its trust policy names no principal we could resolve.</span>;
  const shown = sec.items.slice(0, 3);
  // "n more" only with an exact total; a cursor alone is "More available".
  const rest = sec.total_known && sec.total !== undefined ? sec.total - shown.length : null;
  return (
    <span className="flex flex-col gap-0.5">
      {shown.map((r) => {
        const path = objectPath(r.principal.ref);
        return (
          <span key={r.claim} className="flex flex-wrap items-baseline gap-x-2">
            {path ? (
              <Link {...viaLink(path, from)} className="font-medium text-(--color-primary-text) hover:underline">
                {r.principal.name}
              </Link>
            ) : (
              <span className="font-medium">{r.principal.name}</span>
            )}
            <span className="text-xs text-(--color-text-muted)">{IDENTITY_KIND_LABEL[r.principal.kind] ?? r.principal.kind.replace(/_/g, " ")}</span>
          </span>
        );
      })}
      {rest && rest > 0 ? <span className="text-xs text-(--color-text-muted)">{rest} more</span> : sec.next_cursor || sec.items.length > shown.length ? <span className="text-xs text-(--color-text-muted)">More available</span> : null}
      <Meta>Trusted to assume this role (declared). The caller's own permission was not checked.</Meta>
    </span>
  );
}

export function IdentityOverview({
  ws,
  identity: i,
  gaps,
  frozen = false,
}: {
  ws: string;
  identity: IdentityDetail;
  /** The detail's `meta.coverage`: stated on the account it bears on. */
  gaps?: GraphCoverageGap[];
  /** The object is not in the current publication: what is shown was loaded earlier, and nothing is fetched for it. */
  frozen?: boolean;
}) {
  const kind = IDENTITY_KIND_LABEL[i.kind];
  const attrs = i.provider_attrs;
  const connector = i.sources[0]?.integration;
  const connectorId = connector ? refId(connector as GraphRef) : null;
  const tags = Object.entries(attrs.tags ?? {});
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);

  // The Used by and Permissions tabs' own reads: the same cache entries, so a
  // tab opened afterwards asks nothing new.
  const id = refId(i.ref);
  const args = { ws, rev, key: String(epoch), id };
  const usedQ = useGetGraphIdentityUsedByQuery(args, { skip: rev == null || frozen || i.kind !== "iam_role" });
  const usedFailure = classifyGraphError(usedQ.error);
  useTrackRevision(ws, usedQ.currentData, usedFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentityUsedBy", { ...args, rev: r }, d)),
  );
  const permQ = useGetGraphIdentityPermissionsQuery(args, { skip: rev == null || frozen });
  const permFailure = classifyGraphError(permQ.error);
  useTrackRevision(ws, permQ.currentData, permFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentityPermissions", { ...args, rev: r }, d)),
  );
  const perms = permQ.currentData?.data;
  const sketch = frozen ? null : sketchOf(i, usedQ.currentData?.data, perms);

  return (
    <div className="space-y-4">
      {i.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title={`${i.name} is no longer in the latest scan`}
          body={`It was last confirmed ${dayText(i.last_confirmed_at)}.${i.retired_reason ? ` Reason: ${i.retired_reason.replace(/_/g, " ")}.` : ""}`}
        />
      ) : i.state === "stale" ? (
        <DecisionBanner
          tone="warning"
          title="Not reconfirmed by the latest scan"
          body="What is shown is what was last collected. The header says since when."
        />
      ) : null}

      {sketch ? (
        <NeighbourhoodSketch label={`Neighbourhood of ${i.name}`} columns={sketch.columns} edges={sketch.edges} rootId={sketch.rootId} from={{ ref: i.ref, name: i.name }} note={sketch.note} />
      ) : null}

      {/* Panels flow into two balanced columns on a wide screen. */}
      <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          <Panel title="What it is">
            <Facts>
              <Fact label="Kind">{kind}</Fact>
              <Fact label="Account">{
                  <>
                    {accountWithId(i.account) ?? "Not known"}
                    {accountCoverageNote(gaps, i.account?.id) ? <span className="block text-xs text-(--color-warning-text)">Coverage partial</span> : null}
                  </>
                }</Fact>
              {attrs.path ? <Fact label="Path" mono>{attrs.path}</Fact> : null}
              <Fact label={DIRECT_BINDINGS_LABEL}>{
                  i.kind === "iam_group" ? (
                    "Groups are not run as"
                  ) : (
                    <span title={DIRECT_BINDINGS_MEANING}>
                      {i.used_by_count.value === 0 ? "None" : countText(i.used_by_count, "workload", "workloads")}
                      <span className="block text-xs text-(--color-text-muted)">{DIRECT_BINDINGS_MEANING}</span>
                    </span>
                  )
                }</Fact>
              {i.kind === "iam_role" ? (
                <Fact label="Trusted principals (incoming)">
                  {frozen ? (
                    <span className="text-(--color-text-muted)">Not loaded for a retired object.</span>
                  ) : (
                    <TrustedPrincipals
                      i={i}
                      data={usedQ.currentData?.data}
                      failure={usedFailure}
                      pending={!usedFailure && !usedQ.currentData}
                      retry={() => void usedQ.refetch()}
                      refresh={refresh}
                    />
                  )}
                </Fact>
              ) : null}
              <Fact label="ARN"><CopyValue value={i.arn} what="ARN" /></Fact>
            </Facts>
          </Panel>

          {frozen ? null : permFailure ? (
            <Panel title="Declared permissions — examples">
              <p className="text-[13px]">
                <InlineState failure={permFailure} subject="declared permissions" onRetry={() => void permQ.refetch()} onRefresh={refresh} />
              </p>
            </Panel>
          ) : !perms ? (
            <Panel title="Declared permissions — examples">
              <p className="text-[13px] text-(--color-text-muted)">Loading…</p>
            </Panel>
          ) : (
            <DeclaredExamples
              lines={examplesOf(perms)}
              more={perms.truncated || perms.policies.reduce((n, p) => n + p.statements.length, 0) > 3}
              all={{ to: `/iga/identities/${encodeURIComponent(id)}/permissions`, label: "All on Permissions" }}
              empty="No policy is attached to or inline in this identity."
            />
          )}

          {/* A permissions boundary is stated on the declared permission it limits, not here. */}
          {attrs.trust_has_deny || attrs.trust_has_not_principal ? (
            <Panel title="Trust policy restrictions (listed, not evaluated)">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {attrs.trust_has_deny ? <li>Its trust policy has a Deny statement, which may exclude some principals.</li> : null}
                {attrs.trust_has_not_principal ? (
                  <li>Its trust policy uses NotPrincipal, so who it admits could not be resolved.</li>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          {i.credentials?.length ? (
            <Panel title="Access keys">
              <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                {i.credentials.map((c) => (
                  <li key={c.key_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{c.key_id}</span>
                    <StatusBadge tone={c.status === "Active" ? "neutral" : "warning"}>{c.status}</StatusBadge>
                    <span className="text-xs text-(--color-text-muted)">Created {dayText(c.created_at)}</span>
                    <span className="ml-auto text-xs text-(--color-text-muted)">
                      {c.last_used_at
                        ? `Last authenticated attempt ${agoText(c.last_used_at)}`
                        : "No attempt reported in the available tracking period"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-(--color-text-muted)">Key ids only. Secrets are never collected.</p>
            </Panel>
          ) : null}

          <Panel title="How we know"
            actions={
              <Link
                to={discoveryHref({ provider: "aws", type: "identities", view: "latest", source: connectorId ?? undefined })}
                className="font-medium text-(--color-primary-text) hover:underline"
              >
                Latest collected
              </Link>
            }
          >
            <Facts>
              <Fact label="First seen">{dayText(i.first_seen_at)}</Fact>
              <Fact label="Last confirmed"><Timestamp iso={i.last_confirmed_at} /></Fact>
              <Fact label="Identity continuity">{
                  i.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation${i.immutable_key ? ` (${i.immutable_key})` : ""}, so an ${kind} deleted and recreated under the same name is a new identity.`
                    : "Same name only. AWS gives this identity no creation id we can read, so one recreated under this name looks the same to us."
                }</Fact>
              {tags.length ? (
                <Fact label="Tags">{
                    <span className="flex flex-wrap gap-1.5">
                      {tags.map(([k, v]) => (
                        <span key={k} className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 font-mono text-[11px]">
                          {k}={String(v)}
                        </span>
                      ))}
                    </span>
                  }</Fact>
              ) : null}
            </Facts>
          </Panel>
      </div>
    </div>
  );
}
