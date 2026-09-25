/**
 * An external principal — a principal a trust policy names that we cannot
 * read (SPEC-iga-phase2-graph.md §2.14.5, §5.3): Overview · Referenced by.
 * No Graph tab: there is nothing on the far side we could read. The page says
 * the account is not connected; it never implies the principal is absent.
 */

import { useParams } from "react-router-dom";

import {
  igaGraphApi,
  refId,
  useGetGraphExternalPrincipalQuery,
  useListGraphExternalReferencedByQuery,
  type ExternalPrincipalDetail,
  type GraphListMeta,
  type ReferencedByRow,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { CopyField, DetailGrid, DetailRow, DrawerSection } from "@/components/console/detail";
import { DecisionBanner } from "@/components/console/status";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { resolvePagedView } from "../shared/listView";
import { usePaging } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { accountLabel, agoText, dayText } from "../shared/labels";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { CursorPager } from "../shared/components/CursorPager";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { IdentityName } from "../shared/components/IdentityName";
import { ObjectShell, type ObjectTabDef } from "../shared/components/ObjectShell";
import { CoverageNotice } from "../shared/components/CoverageNotice";
import { emptyGiven } from "../shared/listSummary";
import { activeTabOf } from "../shared/links";

/** Why nothing resolves a principal, in words (never "absent"). */
const UNRESOLVED_REASON: Record<string, string> = {
  wildcard: "The trust policy names any principal (*), not one identity.",
  service_principal: "It is an AWS service, not an identity in an account.",
  account_not_connected: "Its account is not connected, so nothing about it could be read.",
  account_principal: "It names a whole account, not one identity in it.",
  not_in_inventory: "It matches no identity in any connected account.",
};

function Overview({ p }: { p: ExternalPrincipalDetail }) {
  const res = p.resolution;
  return (
    <div className="space-y-4">
      {!p.account_connected ? (
        <DecisionBanner
          tone="warning"
          title={p.account ? `Account ${p.account.id} is not connected` : "Its account could not be determined"}
          body="Nothing about this principal could be read, so what it is and what it can do are unknown. That is not the same as absent."
          actionLabel={p.account ? "Connect the account" : undefined}
          actionHref={p.account ? "/iga/integrations" : undefined}
        />
      ) : null}
      <TableCard>
        <CardContent className="space-y-6">
          <DrawerSection label="What a trust policy names">
            <DetailGrid>
              <DetailRow label="Mechanism" value={p.mechanism} />
              <DetailRow label="Account" value={p.account ? `${accountLabel(p.account)} (${p.account.id})` : "Unknown account"} />
              {p.issuer ? <DetailRow full label="Issuer" value={p.issuer} mono /> : null}
              <CopyField label="Principal" value={p.subject} />
            </DetailGrid>
          </DrawerSection>
          <DrawerSection label="Resolution">
            {res ? (
              <DetailGrid>
                <DetailRow label="State" value={res.state.replace(/_/g, " ")} />
                <DetailRow label="Basis" value={res.basis} />
                {res.rule ? <DetailRow full label="Rule" value={res.rule} mono /> : null}
                {res.resolved_by ? <DetailRow label="Resolved by" value={res.resolved_by} /> : null}
              </DetailGrid>
            ) : (
              <p className="text-sm text-(--color-text-muted)">
                Unresolved. {UNRESOLVED_REASON[p.unresolved_reason ?? ""] ?? "Nothing we can read says which identity this principal is."}
              </p>
            )}
          </DrawerSection>
          <DrawerSection label="How we know">
            <DetailGrid>
              <DetailRow label="First named" value={dayText(p.first_seen_at)} />
              <DetailRow label="Last confirmed" value={agoText(p.last_confirmed_at)} />
            </DetailGrid>
          </DrawerSection>
        </CardContent>
      </TableCard>
    </div>
  );
}

function ReferencedBy({ ws, p }: { ws: string; p: ExternalPrincipalDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const paging = usePaging("referenced-by", epoch);
  const id = refId(p.ref);
  const args = { ws, rev, key: paging.cacheKey, id, cursor: paging.cursor };
  const q = useListGraphExternalReferencedByQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphExternalReferencedBy", { ...args, rev: r }, d)),
  );
  const view = resolvePagedView<ReferencedByRow, GraphListMeta>(q, paging.pageIndex);
  const from = { ref: p.ref, name: p.name };

  return (
    <TableCard>
      <CardContent variant="flush">
        {q.currentData?.meta.coverage?.length ? (
          <div className="p-3">
            <CoverageNotice ws={ws} gaps={q.currentData.meta.coverage} accountName={(id) => id} />
          </div>
        ) : null}
        {view.kind === "loading" ? (
          <div className="p-4">
            <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
          </div>
        ) : view.kind === "failed" ? (
          <GraphStatePanel failure={view.failure} subject="references" onRetry={() => void q.refetch()} onRefresh={refresh} />
        ) : !view.rows.length && !view.footerFailure ? (
          <p className="px-6 py-14 text-center text-sm text-(--color-text-muted)">
            {emptyGiven("No current trust policy names it.", q.currentData?.meta.coverage)}
          </p>
        ) : (
          <>
            <ul className={cn("divide-y divide-(--color-border-subtle)", view.dim && "opacity-60")}>
              {view.rows.map((r) => (
                <li key={r.claim} className="space-y-1.5 px-4 py-3 text-sm">
                  <p className="text-xs text-(--color-text-muted)">May assume</p>
                  <IdentityName identity={r.target} from={from} />
                  <p className="text-xs text-(--color-text-muted)">
                    Trust statement {r.statement.sid || "without a Sid"}
                    {r.statement.negated ? " · uses NotPrincipal, so who it admits could not be resolved" : ""}
                  </p>
                  {r.conditions ? (
                    <p className="text-xs text-(--color-text-muted)">The trust statement sets conditions, which were not evaluated.</p>
                  ) : null}
                  <ClaimFacts claim={r.claim} state={r.state} />
                </li>
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

export default function ExternalPrincipalPage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "identities");

  const args = { ws, rev, key: String(epoch), id };
  const detail = useGetGraphExternalPrincipalQuery(args, { skip: feature.off || !id });
  const failure = feature.off
    ? ({ kind: "unavailable" } as const)
    : feature.unauthorized
      ? ({ kind: "unauthorized" } as const)
      : classifyGraphError(detail.error);
  useTrackRevision(ws, detail.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphExternalPrincipal", { ...args, rev: r }, d)),
  );

  const tabs: ObjectTabDef[] = [
    { key: "overview", label: "Overview", path: "" },
    { key: "referenced-by", label: "Referenced by", path: "/referenced-by" },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const p = detail.currentData?.data;

  return (
    <ObjectShell
      ws={ws}
      listCrumb={{ label: "Identities", to: "/iga/identities" }}
      kindLabel="External principal"
      base={`/iga/external-principals/${encodeURIComponent(id)}`}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      onRetry={() => void detail.refetch()}
      onRefresh={refresh}
      object={
        p
          ? {
              name: p.name,
              description: `External principal · ${p.account ? accountLabel(p.account) : "Unknown account"} · ${p.resolution ? p.resolution.state.replace(/_/g, " ") : "unresolved"}`,
              publishedAt: detail.currentData?.meta.published_at,
            }
          : undefined
      }
    >
      {p ? active === "overview" ? <Overview p={p} /> : rev != null ? <ReferencedBy ws={ws} p={p} /> : null : null}
    </ObjectShell>
  );
}
