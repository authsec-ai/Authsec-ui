/**
 * Resources — what the workload's declared access names (§2.14.6, §2.14.12,
 * §5.3 *Workload › Resources*).
 *
 * One row per resource or selector, and under it ONE LINE PER GRANT: two
 * policies declaring the same action are two lines, each with its own
 * status, so detaching one never looks like losing the access. A selector is
 * never called a resource, an exact reference is never called discovered,
 * and nothing here says "can access".
 */

import { Link, useLocation, useSearchParams } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useListGraphWorkloadResourcesQuery,
  type GraphListMeta,
  type WorkloadDetail,
  type WorkloadResourceRow,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { StatusBadge } from "@/components/console/status";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";

import { classifyGraphError } from "../shared/graphErrors";
import { resolvePagedView } from "../shared/listView";
import { usePaging } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { POLICY_KIND_LABEL, RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, accountLabel, statementLabel } from "../shared/labels";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { CursorPager } from "../shared/components/CursorPager";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { viaLink } from "../shared/links";
import { emptyGiven } from "../shared/listSummary";
import { CoverageSummary } from "../coverage/CoverageSummary";

/** "names 3 selectors and 1 exact reference" — only when the page is the whole answer. */
function namesSummary(rows: WorkloadResourceRow[]): string {
  const n = { exact: 0, selector: 0, external: 0 };
  for (const r of rows) n[r.resource.kind] += 1;
  const parts = [
    n.selector && `${n.selector} ${n.selector === 1 ? "selector" : "selectors"}`,
    n.exact && `${n.exact} exact ${n.exact === 1 ? "reference" : "references"}`,
    n.external && `${n.external} external ${n.external === 1 ? "reference" : "references"}`,
  ].filter(Boolean);
  return `Declared access names ${parts.join(" and ")}.`;
}

function ResourceRow({
  row,
  workload,
  graphAvailable,
}: {
  row: WorkloadResourceRow;
  workload: WorkloadDetail;
  graphAvailable: boolean;
}) {
  const r = row.resource;
  const path = objectPath(r.ref);
  const from = { ref: workload.ref, name: workload.name };
  // Grant lines name their holder by ref; the workload's own execution role is the one we can name here.
  const runsAs = workload.execution_role.state === "resolved" ? workload.execution_role : null;
  const graph = `/iga/estate/${encodeURIComponent(refId(workload.ref))}/graph?target=${encodeURIComponent(r.ref)}`;
  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {path ? (
            <Link {...viaLink(path, from)} className="break-all font-mono text-sm text-(--color-primary-text) hover:underline">
              {r.text}
            </Link>
          ) : (
            <span className="break-all font-mono text-sm">{r.text}</span>
          )}
          <p className="mt-0.5 text-xs text-(--color-text-muted)">
            {accountLabel(r.account)} · {r.region ?? "Region not stated"}
            {r.service ? ` · ${r.service}` : ""}
          </p>
        </div>
        <StatusBadge tone={r.kind === "external" ? "warning" : "neutral"}>{RESOURCE_KIND_LABEL[r.kind]}</StatusBadge>
        {graphAvailable ? (
          <Link to={graph} className="shrink-0 text-xs font-semibold text-(--color-primary-text) hover:underline">
            View in graph
          </Link>
        ) : null}
      </div>
      <p className="text-xs text-(--color-text-muted)">{RESOURCE_KIND_NOTE[r.kind]}</p>

      <ul className="space-y-2 border-l-2 border-(--color-border-subtle) pl-3">
        {row.grants.map((g) => (
          <li key={g.claim} className="space-y-1 text-sm">
            <p>
              <span className="font-mono text-xs">{g.statement.actions.join(", ") || "—"}</span>
              {g.statement.not_actions.length ? (
                <span className="text-xs text-(--color-text-muted)"> · every action except {g.statement.not_actions.join(", ")}</span>
              ) : null}
              <span className="text-(--color-text-muted)"> · granted by </span>
              <span className="font-medium">{g.policy.name}</span>
              <span className="text-xs text-(--color-text-muted)">
                {" "}
                ({POLICY_KIND_LABEL[g.policy.kind]}, {statementLabel(g.statement)})
              </span>
              {runsAs && g.via_identity === runsAs.identity && runsAs.name ? (
                <span className="text-(--color-text-muted)"> · via {runsAs.name}</span>
              ) : null}
              {g.via_group ? <span className="text-(--color-text-muted)"> · through a group it is a member of</span> : null}
            </p>
            {g.exclusions.length ? (
              <p className="text-xs text-(--color-text-muted)">
                All resources except {g.exclusions.map((x) => x.text).join(", ")}.
              </p>
            ) : null}
            {g.statement.conditional ? (
              <p className="text-xs text-(--color-text-muted)">The statement has conditions, which were not evaluated.</p>
            ) : null}
            <ClaimFacts claim={g.claim} basis="declared" state={g.state} confirmedAt={g.last_confirmed_at} />
          </li>
        ))}
      </ul>

      {row.restrictions.deny_statements || row.restrictions.permissions_boundary ? (
        <p className="text-xs text-(--color-warning-text)">
          {[
            row.restrictions.deny_statements
              ? `${row.restrictions.deny_statements} Deny ${row.restrictions.deny_statements === 1 ? "statement" : "statements"}`
              : null,
            row.restrictions.permissions_boundary ? "a permissions boundary" : null,
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          may restrict this. Restrictions are listed, not evaluated.
        </p>
      ) : null}
    </li>
  );
}

export function WorkloadResourcesTab({
  ws,
  workload,
  graphAvailable = true,
}: {
  ws: string;
  workload: WorkloadDetail;
  graphAvailable?: boolean;
}) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  // Sort is in the URL like every list's (§2.14.5); edits replace the entry.
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const sort: "kind" | "name" = params.get("sort") === "name" ? "name" : "kind";
  const setSort = (s: "kind" | "name") => {
    const next = new URLSearchParams(params);
    if (s === "kind") next.delete("sort");
    else next.set("sort", s);
    setParams(next, { replace: true, state: location.state });
  };
  const paging = usePaging(`workload-resources-${sort}`, epoch);
  const args = { ws, rev, key: paging.cacheKey, id: refId(workload.ref), sort, cursor: paging.cursor };
  const q = useListGraphWorkloadResourcesQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloadResources", { ...args, rev: r }, d)),
  );
  const view = resolvePagedView<WorkloadResourceRow, GraphListMeta>(q, paging.pageIndex);

  return (
    <TableCard>
      <CardContent variant="flush">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border-subtle) px-4 py-2">
          <p className="text-xs text-(--color-text-muted)">
            {view.kind === "rows" && !view.meta.next_cursor && !view.previousPage && paging.pageIndex === 0 && view.rows.length
              ? namesSummary(view.rows)
              : "Named by the declared access of this workload's execution identities."}
          </p>
          <div className="flex gap-1" role="group" aria-label="Sort">
            {(["kind", "name"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                onClick={() => setSort(s)}
                className={cn(
                  "h-7 rounded-md px-2 text-xs font-semibold",
                  sort === s ? "bg-(--color-primary-soft) text-(--color-primary-text)" : "text-(--color-text-muted)",
                )}
              >
                By {s}
              </button>
            ))}
          </div>
        </div>
        {q.currentData?.meta.coverage?.length ? (
          <div className="p-3">
            <CoverageSummary subject="resources" ws={ws} gaps={q.currentData.meta.coverage} accountName={(id) => id} />
          </div>
        ) : null}
        {view.kind === "loading" ? (
          <div className="p-4">
            <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
          </div>
        ) : view.kind === "failed" ? (
          <GraphStatePanel failure={view.failure} subject="resources" onRetry={() => void q.refetch()} onRefresh={refresh} />
        ) : !view.rows.length && !view.footerFailure ? (
          <p className="px-6 py-14 text-center text-sm text-(--color-text-muted)">
            {workload.execution_role.state === "resolved"
              ? emptyGiven("No declared access names any resource.", q.currentData?.meta.coverage)
              : "No execution identity was resolved, so no declared access could be read for this workload."}
          </p>
        ) : (
          <>
            <ul className={cn("divide-y divide-(--color-border-subtle)", view.dim && "opacity-60")}>
              {view.rows.map((row) => (
                <ResourceRow key={row.resource.ref} row={row} workload={workload} graphAvailable={graphAvailable} />
              ))}
            </ul>
            <CursorPager
              meta={view.meta}
              pageIndex={paging.pageIndex}
              rowsOnPage={view.rows.length}
              onPrev={paging.prev}
              onNext={paging.next}
              failure={view.footerFailure}
              onRetry={() => void q.refetch()}
              onRefresh={refresh}
              previousPage={view.previousPage}
            />
          </>
        )}
      </CardContent>
    </TableCard>
  );
}
