/**
 * One agent or workload (SPEC-iga-phase2-graph.md §2.14.5, §2.14.6):
 * Overview · Identities · Resources · Graph · Changes.
 *
 * The object is read once here, for the header every tab shares; each tab
 * reads its own route at the same pinned revision.
 */

import { useRetainedDetail } from "../shared/useRetainedDetail";
import { useParams } from "react-router-dom";

import { igaGraphApi, useGetGraphWorkloadQuery } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { StatusBadge } from "@/components/console/status";

import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, RUNTIME_LABEL, accountWithId } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ChangesTab } from "../changes/ChangesTab";
import { LazyGraphTab } from "../shared/components/LazyGraphTab";
import { ObjectShell, RetiredTab, type ObjectTabDef } from "../shared/components/ObjectShell";
import { activeTabOf } from "../shared/links";
import { WorkloadIdentitiesTab } from "./WorkloadIdentitiesTab";
import { WorkloadOverview } from "./WorkloadOverview";
import { WorkloadResourcesTab } from "./WorkloadResourcesTab";

export default function WorkloadPage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "workloads");

  const args = { ws, rev, key: String(epoch), id };
  const detail = useGetGraphWorkloadQuery(args, { skip: feature.off || !id });
  const failure = feature.off
    ? ({ kind: "unavailable" } as const)
    : feature.unauthorized
      ? ({ kind: "unauthorized" } as const)
      : classifyGraphError(detail.error);
  useTrackRevision(ws, detail.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphWorkload", { ...args, rev: r }, d)),
  );

  const tabs: ObjectTabDef[] = [
    { key: "overview", label: "Overview", path: "" },
    { key: "identities", label: "Identities", path: "/identities" },
    { key: "resources", label: "Resources", path: "/resources" },
    { key: "graph", label: "Graph", path: "/graph", workspace: true, gated: true, available: feature.loading ? undefined : feature.features.graph === true },
    { key: "changes", label: "Changes", path: "/changes", gated: true, available: feature.loading ? undefined : feature.features.changes === true },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const retained = useRetainedDetail(`${ws}|${id}`, detail.currentData, failure);
  const w = retained?.data;
  const meta = retained?.meta;
  const base = `/iga/estate/${encodeURIComponent(id)}`;

  // Tabs read at the pinned revision: until the header's answer has pinned it,
  // a tab would request unpinned and have its answer discarded. The Graph tab
  // is the exception: it stays mounted through a Refresh, because it carries
  // the investigation's expansions across to the new revision (§2.14.5).
  let body = null;
  if (w && (active === "overview" || active === "graph" || rev != null)) {
    const retired = w.lifecycle === "retired";
    if (active === "overview") body = <WorkloadOverview ws={ws} workload={w} canClassify={!!meta?.capabilities?.can_classify} />;
    else if (retired) body = <RetiredTab name={w.name} lastConfirmed={w.last_confirmed_at} />;
    else if (active === "identities") body = <WorkloadIdentitiesTab ws={ws} workload={w} />;
    else if (active === "resources")
      body = <WorkloadResourcesTab ws={ws} workload={w} graphAvailable={feature.features.graph === true} />;
    else if (active === "graph") body = <LazyGraphTab ws={ws} root={w.ref} rootName={w.name} />;
    else if (active === "changes") body = <ChangesTab ws={ws} object="workloads" id={id} />;
  }

  return (
    <ObjectShell
      ws={ws}
      listCrumb={{ label: "Agents & workloads", to: "/iga/estate" }}
      kindLabel="Workload"
      base={base}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      onRetry={() => void detail.refetch()}
      onRefresh={refresh}
      object={
        w
          ? {
              name: w.name,
              description: [
                RUNTIME_LABEL[w.runtime_kind],
                accountWithId(w.account) ?? "Account not known",
                w.region ?? "Region not stated",
              ].join(" · "),
              status:
                w.lifecycle === "retired" ? (
                  <StatusBadge tone="neutral">Not in the latest scan</StatusBadge>
                ) : w.classification !== "unclassified" ? (
                  <StatusBadge tone={CLASSIFICATION_TONE[w.classification]}>{CLASSIFICATION_LABEL[w.classification]}</StatusBadge>
                ) : undefined,
              publishedAt: meta?.published_at,
            }
          : undefined
      }
    >
      {body}
    </ObjectShell>
  );
}
