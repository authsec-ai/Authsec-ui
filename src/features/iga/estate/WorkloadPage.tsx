/**
 * One agent or workload (SPEC-iga-phase2-graph.md §2.14.5, §2.14.6):
 * Overview · Identities · Resources · Graph · Changes.
 *
 * The object is read once here, for the header every tab shares; each tab
 * reads its own route at the same pinned revision.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";

import { igaGraphApi, useGetGraphWorkloadQuery } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { Button } from "@/components/ui/button";

import { RUNTIME_LABEL, accountWithId, classificationLabel, classificationTone, dayText } from "../shared/labels";
import { lifecycleView } from "../shared/lifecycle";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { useRetainedDetail } from "../shared/useRetainedDetail";
import { ChangesTab } from "../changes/ChangesTab";
import { ClassifyDialog } from "../classification/ClassifyDialog";
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
    // Each tab answers ONE question: Overview — what is this and should I care;
    // Identity — who does it act as; Resources — what can it reach; Access Graph
    // — how is it connected; History — what changed. The labels are the
    // question's words, not the scanner's.
    //
    // LABELS ONLY. The keys, the URL paths (`/identities`, `/resources`,
    // `/graph`, `/changes`) and the capability flags are the API's words and
    // are untouched, so no deep link (`?evidence=`, `?target=`, `?as=`), route
    // or feature gate moves with the rename.
    { key: "overview", label: "Overview", path: "" },
    { key: "identities", label: "Identity", path: "/identities" },
    { key: "resources", label: "Resources", path: "/resources" },
    { key: "graph", label: "Access Graph", path: "/graph", workspace: true, gated: true, available: feature.loading ? undefined : feature.features.graph === true },
    { key: "changes", label: "History", path: "/changes", gated: true, available: feature.loading ? undefined : feature.features.changes === true },
  ];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const { value: retained, vanished } = useRetainedDetail(`${ws}|${id}`, detail.currentData, failure);
  const w = retained?.data;
  const meta = retained?.meta;
  const base = `/iga/estate/${encodeURIComponent(id)}`;
  const [dialog, setDialog] = useState<"classify" | "undo" | null>(null);

  // Tabs read at the pinned revision: until the header's answer has pinned it,
  // a tab would request unpinned and have its answer discarded. The Graph tab
  // is the exception: it stays mounted through a Refresh, because it carries
  // the investigation's expansions across to the new revision (§2.14.5).
  let body = null;
  const gone = vanished || w?.lifecycle === "retired";
  if (w) {
    // Overview and Changes remain for a retired or vanished object; the other
    // tabs say they have no current data (SPEC-console-revamp.md).
    if (active === "overview") body = <WorkloadOverview ws={ws} workload={w} gaps={meta?.coverage} frozen={vanished} publishedAt={meta?.published_at} />;
    else if (active === "changes") body = rev != null || gone ? <ChangesTab ws={ws} object="workloads" id={id} lastConfirmedAt={w.last_confirmed_at} /> : null;
    else if (gone) body = <RetiredTab name={w.name} lastConfirmed={w.last_confirmed_at} />;
    else if (active === "graph") body = <LazyGraphTab ws={ws} root={w.ref} rootName={w.name} />;
    else if (rev != null && active === "identities") body = <WorkloadIdentitiesTab ws={ws} workload={w} />;
    else if (rev != null && active === "resources")
      body = <WorkloadResourcesTab ws={ws} workload={w} graphAvailable={feature.features.graph === true} />;
  }

  const editable = !!meta?.capabilities?.can_classify && !!w && w.classification !== "provider_native_agent" && w.lifecycle === "active" && !vanished;
  const decision = w?.decision;

  return (
    <>
      <ObjectShell
        ws={ws}
        listType="workloads"
        kindLabel="Workload"
        base={base}
        tabs={tabs}
        activeTab={activeTab}
        failure={vanished ? null : failure}
        vanished={vanished}
        onRetry={() => void detail.refetch()}
        onRefresh={refresh}
        object={
          w
            ? {
                name: w.name,
                kind: { label: RUNTIME_LABEL[w.runtime_kind], category: "workload", icon: "workload" },
                context: [accountWithId(w.account) ?? "Account not known", w.region ?? "Region not stated"],
                lifecycle: lifecycleView(w),
                classification: {
                  label: classificationLabel(w.classification),
                  tone: classificationTone(w.classification),
                  by:
                    w.classification === "provider_native_agent"
                      ? "by what AWS runs it as"
                      : decision
                        ? `by ${decision.decided_by.display}, ${dayText(decision.decided_at)}`
                        : undefined,
                },
                publishedAt: meta?.published_at,
                actions: editable ? (
                  w.classification === "classified_agent" ? (
                    <Button variant="outline" size="sm" onClick={() => setDialog("undo")}>
                      Undo classification
                    </Button>
                  ) : (
                    <Button size="sm" className="text-[length:var(--text-sm)] text-white" onClick={() => setDialog("classify")}>
                      Classify as agent
                    </Button>
                  )
                ) : undefined,
                copy: { value: w.arn, label: "Copy ARN", what: "ARN" },
              }
            : undefined
        }
      >
        {body}
      </ObjectShell>
      {w && dialog ? <ClassifyDialog workload={w} mode={dialog} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
    </>
  );
}
