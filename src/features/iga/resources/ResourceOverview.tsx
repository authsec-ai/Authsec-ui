/**
 * Resource › Overview: its kind and what we know about it (§2.14.12). An
 * exact reference is never called discovered; a selector is never called a
 * resource; an S3 object selector is never rendered as its bucket.
 */


import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphResourceAccessQuery,
  type GraphCoverageGap,
  type ResourceAccess,
  type ResourceDetail,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DecisionBanner, StatusBadge } from "@/components/console/status";

import { discoveryHref } from "../discovery/urlState";
import { SCOPE_LABEL, accessScope } from "../shared/access";
import { classifyGraphError } from "../shared/graphErrors";
import { RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, IDENTITY_KIND_LABEL, accountLabel, dayText, countText } from "../shared/labels";
import { accountCoverageNote } from "../shared/lifecycle";
import { viaLink } from "../shared/links";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { shortResourceName } from "../shared/sketch";
import { incompleteAccounts } from "../shared/listSummary";
import { InlineState } from "../shared/components/InlineState";
import { NeighbourhoodSketch, type SketchEdge, type SketchNode } from "../shared/components/NeighbourhoodSketch";
import { CopyValue, Fact, Facts, Meta, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";

const SKETCH_HOLDERS = 5;

/** The resource and the first identities whose declared access names it — only what the Access tab's first page holds. */
function sketchOf(r: ResourceDetail, access: ResourceAccess | undefined, more: boolean) {
  const root: SketchNode = {
    id: r.ref,
    label: shortResourceName(r.text),
    kind: RESOURCE_KIND_LABEL[r.kind],
    category: r.kind === "external" ? "external" : "resource",
    icon: r.kind === "selector" ? "selector" : "resource",
  };
  const holders: SketchNode[] = [];
  const edges: SketchEdge[] = [];
  const seen = new Set<string>();
  let drawable = 0;
  for (const a of access?.access ?? []) {
    if (seen.has(a.holder.ref)) continue;
    seen.add(a.holder.ref);
    drawable += 1;
    if (holders.length >= SKETCH_HOLDERS) continue;
    const viaGroupOnly = (access?.access ?? []).filter((x) => x.holder.ref === a.holder.ref).every((x) => x.via_group);
    holders.push({
      id: a.holder.ref,
      label: a.holder.name,
      kind: IDENTITY_KIND_LABEL[a.holder.kind] ?? a.holder.kind.replace(/_/g, " "),
      category: "identity",
      icon: a.holder.kind === "iam_user" ? "user" : a.holder.kind === "iam_group" ? "group" : "role",
      to: objectPath(a.holder.ref) ?? undefined,
    });
    edges.push({ from: a.holder.ref, to: r.ref, label: viaGroupOnly ? "declares via group" : "declares" });
  }
  return {
    columns: [holders, [root]],
    edges,
    rootId: r.ref,
    note: drawable > holders.length || more ? `The first ${holders.length} identities with declared access are drawn; the Who can access tab lists the rest.` : null,
  };
}

export function ResourceOverview({
  ws,
  resource: r,
  gaps,
  frozen = false,
  publishedAt,
}: {
  ws: string;
  resource: ResourceDetail;
  /** The detail's `meta.coverage`: stated on the account it bears on. */
  gaps?: GraphCoverageGap[];
  /** The object is not in the current publication: what is shown was loaded earlier, and nothing is fetched for it. */
  frozen?: boolean;
  /** The publication this page reads, said here now that the header no longer repeats it. */
  publishedAt?: string | null;
}) {
  const policy = r.resource_policy;
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  // The Access tab's own first page: the same cache entry.
  const args = { ws, rev, key: `${epoch}.0`, id: refId(r.ref), cursor: undefined };
  const q = useGetGraphResourceAccessQuery(args, { skip: rev == null || frozen });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (rv, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphResourceAccess", { ...args, rev: rv }, d)),
  );
  const first = q.currentData;
  const holders = first ? [...new Map(first.data.access.map((a) => [a.holder.ref, a.holder])).values()] : [];
  const meta = first?.meta;
  const gap = incompleteAccounts(meta?.coverage ?? [], (id) => id);
  // "n more" only with an exact total of holders; a cursor alone is "More available".
  const remaining = meta?.total_known && meta.total !== undefined ? meta.total - holders.length : null;
  const sketch = frozen ? null : sketchOf(r, first?.data, !!meta?.next_cursor);
  const partial = accountCoverageNote(gaps, r.account?.id);
  const scope = accessScope(r);
  const from = { ref: r.ref, name: shortResourceName(r.text) };

  return (
    <div className="space-y-4">
      {r.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title="No longer named by any current statement"
          body={`It was last confirmed ${dayText(r.last_confirmed_at)}.`}
        />
      ) : null}
      {sketch ? (
        <NeighbourhoodSketch label={`Access Graph of ${shortResourceName(r.text)}`} columns={sketch.columns} edges={sketch.edges} rootId={sketch.rootId} from={from} note={sketch.note} />
      ) : null}
      {/* Panels flow into two balanced columns on a wide screen. */}
      <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          <Panel title="What it is">
            <Facts>
              <Fact label="Kind">{
                  <span className="flex flex-col gap-1">
                    <span>
                      <StatusBadge tone={r.kind === "external" || scope === "all" ? "warning" : "neutral"}>{SCOPE_LABEL[scope]}</StatusBadge>
                    </span>
                    <span className="text-(--color-text-muted)">{RESOURCE_KIND_NOTE[r.kind]}</span>
                  </span>
                }</Fact>
              {r.type !== "unknown" ? <Fact label="Type" mono>{r.type}</Fact> : null}
              {r.service ? <Fact label="Service" mono>{r.service}</Fact> : null}
              <Fact label="Account">{
                  r.account ? (
                    <>
                      {accountLabel(r.account)}
                      {r.account.label !== r.account.id ? <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{r.account.id}</span> : null}
                      {!r.account.connected ? <span className="block text-xs text-(--color-warning-text)">Not a connected account</span> : null}
                      {partial ? <span className="block text-xs text-(--color-warning-text)">{partial}</span> : null}
                    </>
                  ) : (
                    <>
                      Unknown account
                      <span className="block text-xs text-(--color-text-muted)">
                        The ARN states no account. It is not assumed to be the grantor's.
                      </span>
                    </>
                  )
                }</Fact>
              <Fact label="Region">{r.region ?? "Region not stated"}</Fact>
              <Fact label="Existence">Not verified. Nothing enumerates resources in this phase.</Fact>
              <Fact label={r.kind === "selector" ? "Pattern" : "ARN"}><CopyValue value={r.text} what={r.kind === "selector" ? "Pattern" : "ARN"} /></Fact>
            </Facts>
          </Panel>

          <Panel
            title="Declared access"
            actions={
              <Link to={`/iga/resources/${encodeURIComponent(refId(r.ref))}/access`} className="font-medium text-(--color-primary-text) hover:underline">
                See who can access
              </Link>
            }
          >
            <Facts>
              <Fact label="Named by">{countText(r.named_by_count, "statement", "statements")}</Fact>
              <Fact label="Excluded by">{
                  !r.excluded_by_count || r.excluded_by_count.value === 0
                    ? "No statement"
                    : countText(r.excluded_by_count, "statement (NotResource)", "statements (NotResource)")
                }</Fact>
              <Fact label="Identities">{
                  frozen ? (
                    <span className="text-(--color-text-muted)">Not loaded for a retired object.</span>
                  ) : failure ? (
                    <InlineState failure={failure} subject="the identities" onRetry={() => void q.refetch()} onRefresh={refresh} />
                  ) : !first ? (
                    <span className="text-(--color-text-muted)">Loading…</span>
                  ) : holders.length ? (
                    <span className="flex flex-col gap-0.5">
                      {holders.slice(0, 3).map((h) => {
                        const path = objectPath(h.ref);
                        return path ? (
                          <Link key={h.ref} {...viaLink(path, from)} className="w-fit font-medium text-(--color-primary-text) hover:underline">
                            {h.name}
                          </Link>
                        ) : (
                          <span key={h.ref} className="font-medium">{h.name}</span>
                        );
                      })}
                      {remaining && remaining > 0 ? (
                        <span className="text-xs text-(--color-text-muted)">{remaining} more</span>
                      ) : meta?.next_cursor || holders.length > 3 ? (
                        <span className="text-xs text-(--color-text-muted)">More available</span>
                      ) : null}
                      {gap.length ? <Meta>Collection is incomplete for {gap.join(", ")}, so this may not be every identity.</Meta> : null}
                      <Meta>Identities whose declared access names it; whether a request would succeed is not evaluated.</Meta>
                    </span>
                  ) : (
                    <span className="text-(--color-text-muted)">
                      {gap.length ? `None found in what could be read; collection is incomplete for ${gap.join(", ")}.` : "No declared access names it as a target."}
                    </span>
                  )
                }</Fact>
              <Fact label="Resource policy">{
                  !policy.read
                    ? "Not read. Whether it has its own policy is unknown."
                    : policy.has_deny === true
                      ? "Read. It has a Deny statement, which may block access that identity-side grants declare. Not combined with them."
                      : policy.has_deny === false
                        ? "Read. It has no Deny statement. Its Allow statements are not combined with identity-side grants."
                        : "Read, but whether it has a Deny statement could not be determined."
                }</Fact>
            </Facts>
          </Panel>

          <Panel
            title="How we know"
            actions={
              <Link
                to={discoveryHref({ provider: "aws", type: "resources", view: "latest" })}
                className="font-medium text-(--color-primary-text) hover:underline"
              >
                Latest collected
              </Link>
            }
          >
            <Facts>
              <Fact label="Last confirmed"><Timestamp iso={r.last_confirmed_at} /></Fact>
              {publishedAt ? <Fact label="Published"><Timestamp iso={publishedAt} /></Fact> : null}
              <Fact label="Found in">{
                  r.sources.length
                    ? r.sources.map((s) => `${accountLabel(s.account)}${s.state !== "current" ? ` (${s.state})` : ""}`).join(", ")
                    : "No current source"
                }</Fact>
            </Facts>
          </Panel>
      </div>
    </div>
  );
}
