/**
 * One identity — an IAM role, user or group (SPEC-iga-phase2-graph.md
 * §2.14.5): Overview · Used by · Permissions · Graph · Changes. An identity
 * is not a workload, so it does not borrow the workload's tabs.
 */

import { useRetainedDetail } from "../shared/useRetainedDetail";
import { useParams } from "react-router-dom";

import { igaGraphApi, useGetGraphIdentityQuery } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { StatusBadge } from "@/components/console/status";

import { IDENTITY_KIND_LABEL, accountWithId } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ChangesTab } from "../changes/ChangesTab";
import { LazyGraphTab } from "../shared/components/LazyGraphTab";
import { ObjectShell, RetiredTab, type ObjectTabDef } from "../shared/components/ObjectShell";
import { activeTabOf } from "../shared/links";
import { IdentityOverview } from "./IdentityOverview";
import { IdentityPermissionsTab } from "./IdentityPermissionsTab";
import { IdentityUsedByTab } from "./IdentityUsedByTab";

export default function IdentityPage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "identities");

  const args = { ws, rev, key: String(epoch), id };
  const detail = useGetGraphIdentityQuery(args, { skip: feature.off || !id });
  const failure = feature.off
    ? ({ kind: "unavailable" } as const)
    : feature.unauthorized
      ? ({ kind: "unauthorized" } as const)
      : classifyGraphError(detail.error);
  useTrackRevision(ws, detail.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentity", { ...args, rev: r }, d)),
  );

  const retained = useRetainedDetail(`${ws}|${id}`, detail.currentData, failure);
  const i = retained?.data;
  const meta = retained?.meta;
  const tabs: ObjectTabDef[] = [
    { key: "overview", label: "Overview", path: "" },
    { key: "used-by", label: i?.kind === "iam_group" ? "Members" : "Used by", path: "/used-by" },
    { key: "permissions", label: "Permissions", path: "/permissions" },
    { key: "graph", label: "Graph", path: "/graph", workspace: true, gated: true, available: feature.loading ? undefined : feature.features.graph === true },
    { key: "changes", label: "Changes", path: "/changes", gated: true, available: feature.loading ? undefined : feature.features.changes === true },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const base = `/iga/identities/${encodeURIComponent(id)}`;

  // Tabs read at the pinned revision: until the header's answer has pinned it,
  // a tab would request unpinned and have its answer discarded. The Graph tab
  // is the exception: it stays mounted through a Refresh, because it carries
  // the investigation's expansions across to the new revision (§2.14.5).
  let body = null;
  if (i && (active === "overview" || active === "graph" || rev != null)) {
    if (active === "overview") body = <IdentityOverview identity={i} />;
    else if (i.lifecycle === "retired") body = <RetiredTab name={i.name} lastConfirmed={i.last_confirmed_at} />;
    else if (active === "used-by") body = <IdentityUsedByTab ws={ws} identity={i} />;
    else if (active === "permissions") body = <IdentityPermissionsTab ws={ws} identity={i} />;
    else if (active === "graph") body = <LazyGraphTab ws={ws} root={i.ref} rootName={i.name} />;
    else if (active === "changes") body = <ChangesTab ws={ws} object="identities" id={id} />;
  }

  return (
    <ObjectShell
      ws={ws}
      listCrumb={{ label: "Identities", to: "/iga/identities" }}
      kindLabel="Identity"
      base={base}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      onRetry={() => void detail.refetch()}
      onRefresh={refresh}
      object={
        i
          ? {
              name: i.name,
              description: [
                IDENTITY_KIND_LABEL[i.kind],
                accountWithId(i.account) ?? "Account not known",
                "global",
              ].join(" · "),
              status: i.lifecycle === "retired" ? <StatusBadge tone="neutral">Not in the latest scan</StatusBadge> : undefined,
              publishedAt: meta?.published_at,
            }
          : undefined
      }
    >
      {body}
    </ObjectShell>
  );
}
