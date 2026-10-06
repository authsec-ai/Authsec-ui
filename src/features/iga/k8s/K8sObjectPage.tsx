/**
 * One Kubernetes object from Discovery — `/iga/k8s/:kind/:id[/access|/graph]`,
 * kind `workload` or `identity` (a ServiceAccount) — on the same shell as the
 * AWS object pages (SPEC-console-revamp.md *Kubernetes object pages*).
 *
 * WHERE EACH FACT COMES FROM, so there is one read path per fact:
 *   - header, Overview and Access: `k8sread` (`/authsec/discovery/k8s/...`):
 *     the workload and ServiceAccount lists, the clusters (the sweep behind the
 *     inventory) and the ServiceAccount's access;
 *   - the Graph tab, and the workload's kind in words: `/api/iga/v1/graph` with
 *     root `workload:<id>` or `identity:<id>` and NO `rev`. A Kubernetes answer
 *     is unrevisioned, so this page never pins a revision, never shows "newer
 *     publication" and ignores `meta.rev` (the AWS publication that happens to
 *     be current). The AWS detail routes 404 for these ids and are not called.
 *
 * An inventory row's `ref` is `workload:<uuid>` or `identity:<uuid>`; that uuid
 * is the id the Kubernetes reads use, so the route id is the ref's uuid. The
 * cluster travels as `?cluster=` because the lists do not carry it.
 *
 * The object is found among the first 500 the lists return; if it is not there
 * the page says so — a different answer from "not found".
 */

import { AlertTriangle } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import { useGetGraphNeighbourhoodQuery, type GraphRef } from "@/app/api/igaGraphApi";
import { useGetK8sAccessQuery, useListK8sClustersQuery, useListK8sIdentitiesQuery, useListK8sWorkloadsQuery } from "@/app/api/k8sGraphApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { loadFailureOf } from "@/components/console/load-failure";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { clusterSweeps } from "../discovery/k8s";
import { DISCOVERY_PATH, TYPE_LABEL, discoveryListHref } from "../discovery/urlState";
import type { GraphFailure } from "../shared/graphErrors";
import { dayText } from "../shared/labels";
import type { LifecycleView } from "../shared/lifecycle";
import { activeTabOf } from "../shared/links";
import { LazyGraphTab } from "../shared/components/LazyGraphTab";
import { Fact, Facts, Panel } from "../shared/components/Panel";
import { ObjectShell, type ObjectHeaderData, type ObjectTabDef } from "../shared/components/ObjectShell";
import { accessRows } from "./access";
import { K8sAccessTab, WORKLOAD_READ_LIMIT } from "./K8sAccessTab";
import { NotEvaluated, RunsAs, WhatTheClusterLetsItDo, type AccessState } from "./K8sOverview";
import { parseAnchor, workloadKindWord } from "./rules";
import { sweepBehind, sweepLine, sweepWarning } from "./sweep";

const TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "access", label: "Access", path: "/access" },
  { key: "graph", label: "Graph", path: "/graph", workspace: true },
];

/** An answer that is not an object page: a different kind of address, or an object past the read cap. */
function Notice({ kind, id, title, children }: { kind: string | undefined; id: string; title: string; children: React.ReactNode }) {
  const list = kind === "workload" ? "workloads" : "identities";
  // The global breadcrumb is the way back; it restores the list the reader left. `/iga/k8s` has no route of its own.
  useBreadcrumbTail(`/iga/k8s/${kind}/${id}`, title, { label: TYPE_LABEL[list], href: discoveryListHref(list, "k8s"), parent: { label: "Discovery", href: DISCOVERY_PATH } });
  return (
    <ConsolePage title={title} variant="object">
      <TableCard>
        <CardContent>
          <p className="text-xs text-(--color-text-muted)">{children}</p>
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}

export default function K8sObjectPage() {
  const { kind, id = "", tab } = useParams<{ kind: string; id: string; tab?: string }>();
  if (kind !== "workload" && kind !== "identity") {
    return (
      <Notice kind={kind} id={id} title="Not found">
        This is not a Kubernetes object page: the address names an object kind Discovery does not have for Kubernetes. Workloads and ServiceAccounts do.
      </Notice>
    );
  }
  return <K8sObject kind={kind} id={id} tab={tab} />;
}

function K8sObject({ kind, id, tab }: { kind: "workload" | "identity"; id: string; tab: string | undefined }) {
  const ws = getWorkspaceId() ?? "";
  const [params] = useSearchParams();
  const clusterParam = params.get("cluster") ?? undefined;
  const isWorkload = kind === "workload";
  const root = `${kind}:${id}` as GraphRef;

  const workloadsQ = useListK8sWorkloadsQuery({ limit: WORKLOAD_READ_LIMIT });
  const identitiesQ = useListK8sIdentitiesQuery({ limit: WORKLOAD_READ_LIMIT }, { skip: isWorkload });
  const clustersQ = useListK8sClustersQuery();

  // One workload may be reported twice, running as one ServiceAccount and configured as another.
  const workloadRows = isWorkload ? (workloadsQ.data ?? []).filter((w) => w.id === id) : [];
  const identity = isWorkload ? undefined : identitiesQ.data?.find((i) => i.id === id);
  const primary = workloadRows.find((w) => w.runs_as_id && w.basis === "observed") ?? workloadRows.find((w) => w.runs_as_id) ?? workloadRows[0];
  const serviceAccountId = isWorkload ? primary?.runs_as_id : identity?.id;

  const found = isWorkload ? workloadRows.length > 0 : !!identity;

  const accessQ = useGetK8sAccessQuery(serviceAccountId ?? "", { skip: !serviceAccountId });
  // The graph's own root read, unpinned: the same entry the Graph tab opens, so it is read once. It names the
  // workload's kind and its cluster, which the flat lists do not; the page does without it when it cannot be read.
  const rootQ = useGetGraphNeighbourhoodQuery({ ws, rev: null, key: "0", root, direction: "forward", assume_hops: 2 }, { skip: !ws || !id || !found });
  const rootNode = rootQ.data?.data.nodes.find((n) => n.ref === root);

  const cluster = clusterParam ?? rootNode?.scope?.id;
  const sweep = sweepBehind(clusterSweeps(undefined, clustersQ.data?.clusters), cluster);

  const listQ = isWorkload ? workloadsQ : identitiesQ;
  const loadFailure = loadFailureOf(listQ.error);
  const failure: GraphFailure | null = loadFailure
    ? loadFailure === "forbidden"
      ? { kind: "unauthorized" }
      : loadFailure === "not_found"
        ? { kind: "not_found" }
        : { kind: "failed" }
    : null;
  const retry = () => {
    void listQ.refetch();
    void clustersQ.refetch();
  };

  if (listQ.data && !found && !failure) {
    return (
      <Notice kind={kind} id={id} title={isWorkload ? "Kubernetes workload" : "Kubernetes ServiceAccount"}>
        Not among the first {WORKLOAD_READ_LIMIT} {isWorkload ? "workloads" : "ServiceAccounts"} the cluster inventory returns. It may have been removed, or the link may be from another workspace. The read is capped, so an
        object beyond the cap cannot be opened here yet.
      </Notice>
    );
  }

  const access: AccessState = !serviceAccountId
    ? { kind: "unresolved" }
    : accessQ.error
      ? { kind: "failed", failure: loadFailureOf(accessQ.error) ?? "failed", retry: () => void accessQ.refetch() }
      : accessQ.data
        ? { kind: "ready", rows: accessRows(accessQ.data.grants ?? []) }
        : { kind: "loading" };

  const row = primary;
  const gone = isWorkload ? row?.lifecycle === "retired" : identity?.lifecycle === "retired";
  const lifecycle: LifecycleView | undefined = gone
    ? { state: "retired", label: "The sweep no longer sees it", since: rootNode?.last_confirmed_at ? `last confirmed ${dayText(rootNode.last_confirmed_at)}` : "", tone: "neutral" }
    : rootNode?.state === "stale"
      ? { state: "stale", label: "Unconfirmed, still believed", since: `last confirmed ${dayText(rootNode.last_confirmed_at)}`, tone: "warning" }
      : undefined;

  const name = isWorkload ? (row?.display_name ?? "") : identity ? (parseAnchor(identity.anchor)?.name ?? identity.anchor) : "";
  const namespace = isWorkload ? row?.namespace : identity?.namespace;
  const warning = sweepWarning(sweep);
  const object: ObjectHeaderData | undefined = found
    ? {
        name,
        kind: isWorkload
          ? { label: `Kubernetes workload${workloadKindWord(rootNode?.runtime_kind) ? ` · ${workloadKindWord(rootNode?.runtime_kind)}` : ""}`, category: "workload", icon: "workload" }
          : { label: "ServiceAccount", category: "identity", icon: "service_account" },
        context: [],
        lifecycle,
        sweep: {
          context: [cluster ? `cluster ${cluster}` : null, namespace ? `namespace ${namespace}` : null].filter((c): c is string => !!c),
          line: sweepLine(sweep, clustersQ.isLoading ? "loading" : clustersQ.isError ? "failed" : "done"),
          warning: warning ? (
            <span role="status" className="inline-flex items-start gap-1.5 text-(--color-warning-text)">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {warning}
            </span>
          ) : undefined,
        },
      }
    : undefined;

  const activeTab = activeTabOf(TABS, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;

  let body = null;
  if (found) {
    if (active === "overview") {
      body = (
        <>
          {isWorkload ? (
            <RunsAs rows={workloadRows} cluster={cluster} />
          ) : (
            <Panel title="ServiceAccount">
              <Facts>
                <Fact label="Namespace">{identity?.namespace || "not stated"}</Fact>
                <Fact label="Principal" mono>
                  {identity?.anchor ?? ""}
                </Fact>
              </Facts>
            </Panel>
          )}
          <WhatTheClusterLetsItDo access={access} sweep={sweep} noun={isWorkload ? "workload" : "ServiceAccount"} />
          <NotEvaluated />
        </>
      );
    } else if (gone) {
      body = (
        <TableCard>
          <CardContent>
            <p className="text-sm text-(--color-text-muted)">
              The sweep no longer sees this {isWorkload ? "workload" : "ServiceAccount"}, so this tab has no current data. Overview shows what was last read.
            </p>
          </CardContent>
        </TableCard>
      );
    } else if (active === "access") {
      body = (
        <K8sAccessTab
          access={access}
          sweep={sweep}
          runners={
            isWorkload
              ? undefined
              : {
                  identityId: id,
                  cluster,
                  workloads: { data: workloadsQ.data, loading: workloadsQ.isLoading, failed: workloadsQ.isError, retry: () => void workloadsQ.refetch() },
                }
          }
        />
      );
    } else if (active === "graph") {
      body = <LazyGraphTab ws={ws} root={root} rootName={name} provider="k8s" />;
    }
  }

  return (
    <ObjectShell
      ws={ws}
      listType={isWorkload ? "workloads" : "identities"}
      provider="k8s"
      kindLabel={isWorkload ? "Workload" : "ServiceAccount"}
      base={`/iga/k8s/${kind}/${encodeURIComponent(id)}`}
      tabs={TABS}
      activeTab={activeTab}
      failure={failure}
      permission="discovery:read"
      onRetry={retry}
      onRefresh={retry}
      object={object}
    >
      {body}
    </ObjectShell>
  );
}
