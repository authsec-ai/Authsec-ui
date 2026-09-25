/**
 * One resource reference or selector (SPEC-iga-phase2-graph.md §2.14.5,
 * §2.14.12): Overview · Access · Graph · Changes.
 */

import { useRetainedDetail } from "../shared/useRetainedDetail";
import { useParams } from "react-router-dom";

import { igaGraphApi, useGetGraphResourceQuery } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { RESOURCE_KIND_LABEL, accountLabel } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
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
    { key: "access", label: "Access", path: "/access" },
    { key: "graph", label: "Graph", path: "/graph", gated: true, available: feature.loading ? undefined : feature.features.graph === true },
    { key: "changes", label: "Changes", path: "/changes", gated: true, available: feature.loading ? undefined : feature.features.changes === true },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const retained = useRetainedDetail(`${ws}|${id}`, detail.currentData, failure);
  const r = retained?.data;
  const meta = retained?.meta;

  // Tabs read at the pinned revision: until the header's answer has pinned it,
  // a tab would request unpinned and have its answer discarded. The Graph tab
  // is the exception: it stays mounted through a Refresh, because it carries
  // the investigation's expansions across to the new revision (§2.14.5).
  let body = null;
  if (r && (active === "overview" || active === "graph" || rev != null)) {
    if (active === "overview") body = <ResourceOverview resource={r} />;
    else if (r.lifecycle === "retired") body = <RetiredTab name={r.text} lastConfirmed={r.last_confirmed_at} />;
    else if (active === "access") body = <ResourceAccessTab ws={ws} resource={r} />;
    else if (active === "graph") body = <LazyGraphTab ws={ws} root={r.ref} rootName={r.text} />;
    else if (active === "changes") body = <ChangesTab ws={ws} object="resources" id={id} />;
  }

  return (
    <ObjectShell
      ws={ws}
      listCrumb={{ label: "Resources", to: "/iga/resources" }}
      kindLabel="Resource"
      base={`/iga/resources/${encodeURIComponent(id)}`}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      onRetry={() => void detail.refetch()}
      onRefresh={refresh}
      object={
        r
          ? {
              name: r.text,
              description: [
                RESOURCE_KIND_LABEL[r.kind],
                r.service,
                accountLabel(r.account),
                r.region ?? "Region not stated",
              ]
                .filter(Boolean)
                .join(" · "),
              publishedAt: meta?.published_at,
            }
          : undefined
      }
    >
      {body}
    </ObjectShell>
  );
}
