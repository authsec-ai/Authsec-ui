/**
 * One resource reference or selector (SPEC-iga-phase2-graph.md §2.14.5,
 * §2.14.12): Overview · Access · Graph · Changes.
 */

import { useParams } from "react-router-dom";

import { igaGraphApi, useGetGraphResourceQuery } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";

import { RESOURCE_KIND_LABEL, accountWithId } from "../shared/labels";
import { lifecycleView } from "../shared/lifecycle";
import { shortResourceName } from "../shared/sketch";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { useRetainedDetail } from "../shared/useRetainedDetail";
import { ChangesTab } from "../changes/ChangesTab";
import { LazyGraphTab } from "../shared/components/LazyGraphTab";
import { ObjectShell, RetiredTab, type ObjectTabDef } from "../shared/components/ObjectShell";
import { activeTabOf } from "../shared/links";
import { ResourceAccessTab } from "./ResourceAccessTab";
import { ResourceOverview } from "./ResourceOverview";

export default function ResourcePage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "resources");

  const args = { ws, rev, key: String(epoch), id };
  const detail = useGetGraphResourceQuery(args, { skip: feature.off || !id });
  const failure = feature.off
    ? ({ kind: "unavailable" } as const)
    : feature.unauthorized
      ? ({ kind: "unauthorized" } as const)
      : classifyGraphError(detail.error);
  useTrackRevision(ws, detail.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphResource", { ...args, rev: r }, d)),
  );

  const tabs: ObjectTabDef[] = [
    { key: "overview", label: "Overview", path: "" },
    // A resource's "Access" tab lists who can reach IT, the reverse of a
    // workload's Access tab, so it says so. Labels only: keys, paths and
    // capability flags are unchanged.
    { key: "access", label: "Who can access", path: "/access" },
    { key: "graph", label: "Access Graph", path: "/graph", workspace: true, gated: true, available: feature.loading ? undefined : feature.features.graph === true },
    { key: "changes", label: "History", path: "/changes", gated: true, available: feature.loading ? undefined : feature.features.changes === true },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const { value: retained, vanished } = useRetainedDetail(`${ws}|${id}`, detail.currentData, failure);
  const r = retained?.data;
  const meta = retained?.meta;

  // Tabs read at the pinned revision: until the header's answer has pinned it,
  // a tab would request unpinned and have its answer discarded. The Graph tab
  // is the exception: it stays mounted through a Refresh, because it carries
  // the investigation's expansions across to the new revision (§2.14.5).
  let body = null;
  const gone = vanished || r?.lifecycle === "retired";
  if (r) {
    // Overview and Changes remain for a retired or vanished object; the other
    // tabs say they have no current data (SPEC-console-revamp.md).
    if (active === "overview") body = <ResourceOverview ws={ws} resource={r} gaps={meta?.coverage} frozen={vanished} publishedAt={meta?.published_at} />;
    else if (active === "changes") body = rev != null || gone ? <ChangesTab ws={ws} object="resources" id={id} lastConfirmedAt={r.last_confirmed_at} /> : null;
    else if (gone) body = <RetiredTab name={r.text} lastConfirmed={r.last_confirmed_at} />;
    else if (active === "graph") body = <LazyGraphTab ws={ws} root={r.ref} rootName={r.text} />;
    else if (rev != null && active === "access") body = <ResourceAccessTab ws={ws} resource={r} />;
  }

  return (
    <ObjectShell
      ws={ws}
      listType="resources"
      kindLabel="Resource"
      base={`/iga/resources/${encodeURIComponent(id)}`}
      tabs={tabs}
      activeTab={activeTab}
      failure={vanished ? null : failure}
      vanished={vanished}
      onRetry={() => void detail.refetch()}
      onRefresh={refresh}
      object={
        r
          ? {
              // The short name leads; the full reference is in Copy and the Overview, never forcing the header wide.
              name: shortResourceName(r.text),
              kind: {
                label: RESOURCE_KIND_LABEL[r.kind],
                category: r.kind === "external" ? "external" : "resource",
                icon: r.kind === "selector" ? "selector" : "resource",
              },
              context: [
                r.service,
                // The ARN may state no account; it is never assumed to be the grantor's.
                accountWithId(r.account) ?? "Account not stated",
                r.region ?? "Region not stated",
              ].filter((x): x is string => !!x),
              lifecycle: lifecycleView(r),
              publishedAt: meta?.published_at,
              copy:
                r.kind === "selector"
                  ? { value: r.text, label: "Copy pattern", what: "Pattern" }
                  : r.text.startsWith("arn:")
                    ? { value: r.text, label: "Copy ARN", what: "ARN" }
                    : { value: r.text, label: "Copy reference", what: "Reference" },
            }
          : undefined
      }
    >
      {body}
    </ObjectShell>
  );
}
