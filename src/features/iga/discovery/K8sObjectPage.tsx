/**
 * One Kubernetes object from Discovery — `/iga/k8s/:kind/:id`, kind `workload`
 * or `identity` (a ServiceAccount).
 *
 * HOW AN INVENTORY ROW MAPS HERE. An inventory row's `ref` is `workload:<uuid>`
 * or `identity:<uuid>`. For Kubernetes rows that uuid is the id the Kubernetes
 * access reads use — `iga_workload.id` for a workload, `iga_identity_accounts.id`
 * for a ServiceAccount (internal/k8sread) — so the route id is the ref's uuid.
 * A workload's chain starts at its ServiceAccount (`runs_as_id`); a
 * ServiceAccount's is `getK8sAccess(id)` directly. The cluster travels as
 * `?cluster=` because the access reads do not carry it.
 *
 * The object is found among the first 500 the access reads return; if it is not
 * there the page says so — a different answer from "not found".
 */

import { Link, useParams, useSearchParams } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { loadFailureOf } from "@/components/console/load-failure";
import { StatusBadge } from "@/components/console/status";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { useListK8sClustersQuery, useListK8sIdentitiesQuery, useListK8sWorkloadsQuery } from "@/app/api/k8sGraphApi";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { FailurePanel } from "./ListStates";
import { AccessChain } from "./K8sAccessChain";
import { clusterSweeps, inScope, K8S_COVERAGE_LABEL } from "./k8s";
import { discoveryListHref, typeCrumbLabel } from "./urlState";

const MUTED = "text-(--color-text-muted)";

function Shell({ title, description, back, children }: { title: string; description?: string; back: string; children: React.ReactNode }) {
  return (
    <ConsolePage title={title} description={description} variant="object">
      <Link to={back} className="text-sm font-medium text-(--color-primary-text) hover:underline">
        ← Back to Discovery
      </Link>
      {children}
    </ConsolePage>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <TableCard>
      <CardContent>
        <p className="text-sm font-semibold text-(--color-text)">{title}</p>
        <p className="mt-1 text-xs text-(--color-text-muted)">{children}</p>
      </CardContent>
    </TableCard>
  );
}

export default function K8sObjectPage() {
  const { kind, id = "" } = useParams<{ kind: string; id: string }>();
  const [params] = useSearchParams();
  const cluster = params.get("cluster") ?? undefined;
  const isWorkload = kind === "workload";
  const isIdentity = kind === "identity";

  const workloadsQ = useListK8sWorkloadsQuery({ limit: 500 }, { skip: !isWorkload && !isIdentity });
  const identitiesQ = useListK8sIdentitiesQuery({ limit: 500 }, { skip: !isIdentity });
  const clustersQ = useListK8sClustersQuery();

  const workload = isWorkload ? workloadsQ.data?.find((w) => w.id === id) : undefined;
  const identity = isIdentity ? identitiesQ.data?.find((i) => i.id === id) : undefined;
  const type = isWorkload ? "workloads" : "identities";
  const back = discoveryListHref(type);
  const name = workload?.display_name ?? identity?.anchor ?? (isWorkload ? "Kubernetes workload" : "Kubernetes ServiceAccount");
  useBreadcrumbTail(name === "Kubernetes workload" || name === "Kubernetes ServiceAccount" ? null : `/iga/k8s/${kind}/${id}`, name, { label: typeCrumbLabel(type), href: back });

  const sweeps = clusterSweeps(undefined, clustersQ.data?.clusters);
  // The sweep behind THIS cluster; without a cluster, the weakest one — an unknown
  // cluster-admin binding hides in the one that was not fully read.
  const rank: Record<string, number> = { incomplete: 0, not_swept: 1, namespaced_only: 2, complete: 3 };
  const inCluster = inScope(sweeps, cluster);
  const sweep = [...inCluster].sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9))[0];

  if (!isWorkload && !isIdentity) {
    return (
      <Shell title="Not found" back={discoveryListHref("workloads")}>
        <Notice title="This is not a Kubernetes object page">The address names an object kind Discovery does not have for Kubernetes. Workloads and ServiceAccounts do.</Notice>
      </Shell>
    );
  }

  const q = isWorkload ? workloadsQ : identitiesQ;
  const failure = loadFailureOf(q.error);
  if (q.isLoading) {
    return (
      <Shell title={name} back={back}>
        <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
      </Shell>
    );
  }
  if (failure) {
    return (
      <Shell title={name} back={back}>
        <TableCard>
          <CardContent variant="flush">
            <FailurePanel failure={failure === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }} subject={`this ${isWorkload ? "workload" : "ServiceAccount"}`} permission="discovery:read" onRetry={() => void q.refetch()} />
          </CardContent>
        </TableCard>
      </Shell>
    );
  }
  if (!workload && !identity) {
    return (
      <Shell title={name} back={back}>
        <Notice title={`Not among the first 500 ${isWorkload ? "workloads" : "ServiceAccounts"} the cluster inventory returns`}>
          It may have been removed, or the link may be from another workspace. The inventory read is capped, so an object beyond the cap cannot be opened here yet.
        </Notice>
      </Shell>
    );
  }

  const coverageBanner =
    sweep && sweep.state !== "complete" ? (
      <p
        role="status"
        className={`rounded-md px-3 py-2 text-xs ${sweep.state === "incomplete" ? "bg-(--color-danger-soft) text-(--color-danger-text)" : "bg-(--color-warning-soft) text-(--color-warning-text)"}`}
      >
        <strong className="font-medium">{K8S_COVERAGE_LABEL[sweep.state] ?? sweep.state}.</strong> {sweep.limitation ?? "Part of the cluster was not read, so what it grants there is unknown, not absent."}
      </p>
    ) : null;

  if (workload) {
    const runsAsHref = workload.runs_as_id ? `/iga/k8s/identity/${workload.runs_as_id}${cluster ? `?cluster=${encodeURIComponent(cluster)}` : ""}` : undefined;
    return (
      <Shell title={workload.display_name} description={["Kubernetes workload", cluster ? `cluster ${cluster}` : null, workload.namespace ? `namespace ${workload.namespace}` : "cluster-wide"].filter(Boolean).join(" · ")} back={back}>
        {coverageBanner}
        <Panel title="Execution identity" description="The ServiceAccount this workload executes as. Its access is what the workload can reach in the cluster.">
          <Facts>
            <Fact label="State">{workload.lifecycle === "retired" ? <StatusBadge tone="neutral">Ended</StatusBadge> : <span>{workload.lifecycle}</span>}</Fact>
            <Fact label="Runs as" mono={!!workload.runs_as}>
              {workload.runs_as ? (
                runsAsHref ? (
                  <Link to={runsAsHref} className="hover:underline">
                    {workload.runs_as}
                  </Link>
                ) : (
                  workload.runs_as
                )
              ) : (
                <span className={MUTED}>Not resolved — its access was not calculated. That is not the same as having none.</span>
              )}
            </Fact>
            {workload.runs_as ? <Fact label="Basis">{workload.basis === "observed" ? "Observed running" : "Configured only"}</Fact> : null}
          </Facts>
        </Panel>
        {workload.runs_as_id && workload.runs_as ? (
          <AccessChain identityId={workload.runs_as_id} anchor={workload.runs_as} anchorHref={runsAsHref} workload={{ name: workload.display_name }} sweep={sweep} />
        ) : (
          <Panel title="Access chain">
            <p className="text-sm text-(--color-text-muted)">
              No chain, because the ServiceAccount could not be resolved. Unresolved is not “no access” — it is access not calculated.
            </p>
          </Panel>
        )}
      </Shell>
    );
  }

  const i = identity!;
  const runners = (workloadsQ.data ?? []).filter((w) => w.runs_as_id === i.id);
  return (
    <Shell title={i.anchor} description={["Kubernetes ServiceAccount", cluster ? `cluster ${cluster}` : null, i.namespace ? `namespace ${i.namespace}` : null].filter(Boolean).join(" · ")} back={back}>
      {coverageBanner}
      <Panel title="ServiceAccount">
        <Facts>
          <Fact label="State">{i.lifecycle === "retired" ? <StatusBadge tone="neutral">Ended</StatusBadge> : <span>{i.lifecycle}</span>}</Fact>
          <Fact label="Rules reaching it">
            {i.grants}
            {i.wildcard ? <span className="text-(--color-warning-text)"> · includes a wildcard</span> : null}
            {i.stale ? <span className={MUTED}> · {i.stale} unconfirmed by the latest sweep</span> : null}
          </Fact>
        </Facts>
      </Panel>
      <AccessChain identityId={i.id} anchor={i.anchor} sweep={sweep} />
      <Panel
        title="Workloads that run as it"
        count={workloadsQ.data ? `${runners.length}` : undefined}
        description="Among the first 500 workloads the cluster inventory returns."
      >
        {workloadsQ.isLoading ? (
          <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading workloads" />
        ) : workloadsQ.isError ? (
          <p role="alert" className="text-sm text-(--color-danger-text)">
            Could not read the workloads, so it is not known which run as this ServiceAccount.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void workloadsQ.refetch()}>
              Retry
            </button>
          </p>
        ) : runners.length ? (
          <ul className="space-y-1 text-sm">
            {runners.map((w) => (
              <li key={w.id}>
                <Link to={`/iga/k8s/workload/${w.id}${cluster ? `?cluster=${encodeURIComponent(cluster)}` : ""}`} className="font-medium hover:underline">
                  {w.display_name}
                </Link>
                <span className={MUTED}> · {w.namespace || "cluster-wide"} · {w.basis === "observed" ? "observed running" : "configured"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-(--color-text-muted)">No workload among those read is known to run as it.</p>
        )}
      </Panel>
    </Shell>
  );
}
