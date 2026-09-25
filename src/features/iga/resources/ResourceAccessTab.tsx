/**
 * Resource › Access (§5.3): which identities are granted what on it, by
 * which statement — one row per (holder, grant), paged by holder.
 *
 * Kept apart and never counted as access: Allow statements that name it in
 * `NotResource` (they EXCLUDE it) and Deny statements naming it. Both are
 * restrictions, shown as such. "Granted" is declared access, never proof a
 * request succeeds.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphResourceAccessQuery,
  type AccessRow,
  type GraphListMeta,
  type ResourceDetail,
  type RestrictionRow,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DrawerSection } from "@/components/console/detail";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";

import { classifyGraphError } from "../shared/graphErrors";
import { resolvePagedView } from "../shared/listView";
import { usePaging } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { POLICY_KIND_LABEL, statementLabel } from "../shared/labels";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { CursorPager } from "../shared/components/CursorPager";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { IdentityName } from "../shared/components/IdentityName";
import { viaLink } from "../shared/links";
import { emptyGiven } from "../shared/listSummary";
import { CoverageNotice } from "../shared/components/CoverageNotice";

type From = { ref: ResourceDetail["ref"]; name: string };

function Restrictions({
  label,
  rows,
  more,
  note,
}: {
  label: string;
  rows: RestrictionRow[];
  /** The server capped the list: there are more such statements than shown. */
  more: boolean;
  note: string;
}) {
  if (!rows.length) return null;
  return (
    <DrawerSection label={label}>
      <p className="mb-2 text-xs text-(--color-text-muted)">{note}</p>
      <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
        {rows.map((r) => (
          <li key={r.statement.ref} className="space-y-1 px-4 py-3 text-sm">
            <p>
              <span className="font-medium">{r.policy.name}</span>
              <span className="text-xs text-(--color-text-muted)">
                {" "}
                ({POLICY_KIND_LABEL[r.policy.kind]}, {statementLabel(r.statement)})
              </span>{" "}
              <span className="font-mono text-xs">{r.statement.actions.join(", ")}</span>
            </p>
            <p className="text-xs text-(--color-text-muted)">
              Held by {r.holders.length}
              {r.holders_more ? "+" : ""} {r.holders.length === 1 && !r.holders_more ? "identity" : "identities"}
            </p>
          </li>
        ))}
      </ul>
      {more ? <p className="mt-2 text-xs text-(--color-text-muted)">More statements do this than are listed here.</p> : null}
    </DrawerSection>
  );
}

export function ResourceAccessTab({ ws, resource }: { ws: string; resource: ResourceDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const paging = usePaging("resource-access", epoch);
  const args = { ws, rev, key: paging.cacheKey, id: refId(resource.ref), cursor: paging.cursor };
  const q = useGetGraphResourceAccessQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphResourceAccess", { ...args, rev: r }, d)),
  );
  // The paged part is `access`; the restrictions come with page one.
  const view = resolvePagedView<AccessRow, GraphListMeta>(
    {
      currentData: q.currentData ? { data: q.currentData.data.access, meta: q.currentData.meta } : undefined,
      data: q.data ? { data: q.data.data.access, meta: q.data.meta } : undefined,
      error: q.error,
      isFetching: q.isFetching,
    },
    paging.pageIndex,
  );
  // The restrictions come with every page; while a next page loads, the last
  // page's (same resource) stay. Never another resource's.
  const whole = q.currentData?.data ?? (paging.pageIndex > 0 ? q.data?.data : undefined);
  const from: From = { ref: resource.ref, name: resource.text };

  let access: ReactNode;
  if (view.kind === "loading") {
    access = <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />;
  } else if (view.kind === "failed") {
    access = <GraphStatePanel failure={view.failure} subject="access" onRetry={() => void q.refetch()} onRefresh={refresh} />;
  } else if (!view.rows.length && !view.footerFailure) {
    access = (
      <p className="text-sm text-(--color-text-muted)">
        {emptyGiven("No declared access names this as a target.", q.currentData?.meta.coverage)}
      </p>
    );
  } else {
    access = (
      <div className="rounded-md border border-(--color-border-subtle)">
        <ul className={cn("divide-y divide-(--color-border-subtle)", view.dim && "opacity-60")}>
          {view.rows.map((a) => {
            const path = objectPath(a.holder.ref);
            return (
              <li key={`${a.holder.ref}:${a.grant.claim}:${a.via_group?.ref ?? ""}`} className="space-y-1.5 px-4 py-3 text-sm">
                <IdentityName identity={a.holder} from={from} />
                {a.via_group ? (
                  <p className="text-xs text-(--color-text-muted)">
                    Through group{" "}
                    {objectPath(a.via_group.ref) ? (
                      <Link {...viaLink(objectPath(a.via_group.ref) ?? "", from)} className="text-(--color-primary-text) hover:underline">
                        {a.via_group.name}
                      </Link>
                    ) : (
                      a.via_group.name
                    )}
                  </p>
                ) : null}
                <p>
                  <span className="font-mono text-xs">{a.statement.actions.join(", ") || "—"}</span>
                  <span className="text-(--color-text-muted)"> · granted by </span>
                  <span className="font-medium">{a.policy.name}</span>
                  <span className="text-xs text-(--color-text-muted)">
                    {" "}
                    ({POLICY_KIND_LABEL[a.policy.kind]}, {statementLabel(a.statement)})
                  </span>
                </p>
                {a.statement.conditional ? (
                  <p className="text-xs text-(--color-text-muted)">The statement has conditions, which were not evaluated.</p>
                ) : null}
                <ClaimFacts claim={a.grant.claim} basis="declared" state={a.state} />
                {a.via_group ? (
                  <ClaimFacts claim={a.via_group.membership.claim} type="member of" state={a.via_group.membership.state} />
                ) : null}
                {path ? (
                  <Link
                    to={`${path}/graph?target=${encodeURIComponent(resource.ref)}`}
                    className="text-xs font-semibold text-(--color-primary-text) hover:underline"
                  >
                    View the path in graph
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        <CursorPager
          meta={view.meta}
          pageIndex={paging.pageIndex}
          rowsOnPage={new Set(view.rows.map((a) => a.holder.ref)).size}
          onPrev={paging.prev}
          onNext={paging.next}
          failure={view.footerFailure}
          onRetry={() => void q.refetch()}
          onRefresh={refresh}
          previousPage={view.previousPage}
        />
      </div>
    );
  }

  return (
    <TableCard>
      <CardContent className="space-y-6">
        {q.currentData?.meta.coverage?.length ? (
          <CoverageNotice ws={ws} gaps={q.currentData.meta.coverage} accountName={(id) => id} />
        ) : null}
        <DrawerSection label="Granted by declared access">{access}</DrawerSection>
        {whole ? (
          <>
            <Restrictions
              label="Excluded by (NotResource)"
              rows={whole.excluded_by}
              more={whole.excluded_by_more}
              note="These Allow statements grant every resource EXCEPT this one. They exclude it; they do not grant it."
            />
            <Restrictions
              label="Deny statements naming it"
              rows={whole.deny_statements_naming}
              more={whole.deny_statements_naming_more}
              note="A Deny may block what the grants above declare. Restrictions are listed, not evaluated."
            />
          </>
        ) : null}
      </CardContent>
    </TableCard>
  );
}
