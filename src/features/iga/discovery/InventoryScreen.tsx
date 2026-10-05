/**
 * Kubernetes: the unified inventory (B1) — `provider=k8s`, one class per type.
 *
 * Search is the inventory's `q` (name and native id). Source (cluster) and Kind
 * are its `scope` and `kind` filters, and their counts its facets. Namespace
 * has no server filter: it narrows the rows already loaded and says so. Paging
 * is a signed cursor in history state.
 *
 * Kubernetes writes are UNREVISIONED: there is no publication number and no
 * "newer publication" prompt. What the rows are as of is the sweep behind them,
 * in the page header. What a workload runs as, and how much the ServiceAccount
 * can do, come from the Kubernetes access reads, joined here by id and said to
 * be unavailable when they cannot be — never filled in.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { refId } from "@/app/api/igaGraphApi";
import { useListInventoryQuery, type InventoryMeta, type InventoryRow } from "@/app/api/igaInventoryApi";
import { useListK8sClustersQuery, useListK8sIdentitiesQuery, useListK8sWorkloadsQuery, type K8sIdentity, type K8sWorkload } from "@/app/api/k8sGraphApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { TableCard } from "@/theme/components/cards";

import { SortSelect } from "../shared/components/FacetSelect";
import { PreviewLayout, type PreviewModel } from "../shared/components/ObjectPreview";
import { Timestamp } from "../shared/components/Timestamp";
import { resolvePagedView, useRestartOnListingChanged, type PagedView } from "../shared/listView";
import { usePaging, useRestoreScroll } from "../shared/paging";
import { DiscoveryTable, RowName } from "./DiscoveryTable";
import { reportedFacet, sourceFacet } from "./facets";
import type { FacetSpec } from "./FacetBar";
import { clusterSweeps, inScope, K8S_COVERAGE_LABEL } from "./k8s";
import { EmptyList, FilteredEmpty, SourceHasNoRows, UnknownSource } from "./ListStates";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenProps } from "./screenTypes";

const MUTED = "text-(--color-text-muted)";

const SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "-last_seen", label: "Last seen" },
] as const;

const KIND_LABEL: Record<string, string> = {
  k8s_deployment: "Deployment",
  k8s_statefulset: "StatefulSet",
  k8s_daemonset: "DaemonSet",
  k8s_cronjob: "CronJob",
  k8s_job: "Job",
  k8s_pod: "Pod",
  k8s_workload: "Workload",
  k8s_service_account: "ServiceAccount",
  k8s_user: "User",
  k8s_group: "Group",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k.replace(/^k8s_/, "").replace(/_/g, " ");

type Enrichment<T> = { state: "loading" } | { state: "unavailable" } | { state: "ready"; byId: Map<string, T> };

/** A joined read that may be loading, unavailable or capped — each said, none guessed. */
function enrich<T extends { id: string }>(q: { data?: T[]; isLoading: boolean; isError: boolean }): Enrichment<T> {
  if (q.data) return { state: "ready", byId: new Map(q.data.map((x) => [x.id, x])) };
  return q.isError ? { state: "unavailable" } : { state: "loading" };
}

function Cell<T>({ e, id, render }: { e: Enrichment<T>; id: string; render: (x: T) => ReactNode }) {
  if (e.state === "loading") return <span className={MUTED}>…</span>;
  if (e.state === "unavailable") return <span className={MUTED}>Not available</span>;
  const hit = e.byId.get(id);
  // Absent from the first 500: not known, which is not the same as none.
  if (!hit) return <span className={MUTED}>Not available</span>;
  return <>{render(hit)}</>;
}

function rules(n: number): string {
  return `${n} ${n === 1 ? "rule" : "rules"}`;
}

export default function InventoryScreen(p: ScreenProps) {
  const navigate = useNavigate();
  const type = p.type === "identities" ? "identities" : "workloads";
  const paging = usePaging(`discovery-k8s-${type}`, 0);
  const [restarted, setRestarted] = useState(false);
  const kind = p.url.get("kind");
  const namespace = p.url.get("namespace");
  const sort = (SORTS.map((s) => s.value) as string[]).includes(p.url.sort ?? "") ? (p.url.sort as (typeof SORTS)[number]["value"]) : "name";
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const scopeId = p.scope.kind === "one" ? p.scope.source.scopeId : undefined;

  const list = useListInventoryQuery(
    { ws: p.ws, key: paging.cacheKey, class: type, provider: "k8s", kind, scope: scopeId, q: p.url.q, sort, cursor: paging.cursor },
    { skip: blocked },
  );
  useRestartOnListingChanged(list.error, paging.restart, () => setRestarted(true));
  const rawView = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll(`discovery-k8s-${type}`, rawView.kind === "rows");
  const facets = list.currentData?.meta.facets;

  const workloadsQ = useListK8sWorkloadsQuery({ limit: 500 }, { skip: type !== "workloads" || blocked });
  const identitiesQ = useListK8sIdentitiesQuery({ limit: 500 }, { skip: type !== "identities" || blocked });
  const clustersQ = useListK8sClustersQuery(undefined, { skip: blocked });
  const wl = enrich<K8sWorkload>(workloadsQ);
  const ids = enrich<K8sIdentity>(identitiesQ);
  const sweeps = clusterSweeps(list.currentData?.meta.coverage, clustersQ.data?.clusters);

  // Namespace: the inventory has no such filter, so it narrows the loaded rows.
  const loadedRows = rawView.kind === "rows" ? rawView.rows : [];
  const namespaces = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of loadedRows) if (r.sub_scope) m.set(r.sub_scope, (m.get(r.sub_scope) ?? 0) + 1);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [loadedRows]);
  const view: PagedView<InventoryRow, InventoryMeta> =
    rawView.kind === "rows" && namespace ? { ...rawView, rows: rawView.rows.filter((r) => r.sub_scope === namespace) } : rawView;

  const rows = view.kind === "rows" ? view.rows : [];
  const selectedId = p.url.sel;
  const selected = selectedId ? rows.find((r) => refId(r.ref) === selectedId) : undefined;
  const dropSelection = view.kind === "rows" && !view.dim && !view.footerFailure && !!selectedId && !selected;
  const { select } = p.url;
  useEffect(() => {
    if (dropSelection) select(null);
  }, [dropSelection, select]);

  const detailHref = (r: InventoryRow) => `/iga/k8s/${type === "identities" ? "identity" : "workload"}/${encodeURIComponent(refId(r.ref))}${r.scope ? `?cluster=${encodeURIComponent(r.scope.id)}` : ""}`;

  const columns = useMemo<AdaptiveColumn<InventoryRow>[]>(() => {
    const name: AdaptiveColumn<InventoryRow> = {
      id: "name",
      header: "Name",
      primary: true,
      minWidth: 240,
      cell: ({ row }) => (
        <RowName
          to={detailHref(row.original)}
          name={row.original.name}
          rowKey={refId(row.original.ref)}
          selected={selectedId === refId(row.original.ref)}
          context={[kindLabel(row.original.kind), row.original.sub_scope]}
          account={row.original.scope?.label}
        />
      ),
    };
    const lifecycle: AdaptiveColumn<InventoryRow> = {
      id: "lifecycle",
      header: "State",
      priority: 1,
      approxWidth: 100,
      cardSummary: true,
      cell: ({ row }) =>
        row.original.lifecycle === "retired" ? (
          <StatusBadge tone="neutral">Ended</StatusBadge>
        ) : row.original.state === "stale" ? (
          <StatusBadge tone="warning">Stale</StatusBadge>
        ) : (
          <span className={`text-sm ${MUTED}`}>Current</span>
        ),
    };
    const cluster: AdaptiveColumn<InventoryRow> = {
      id: "account",
      header: "Cluster",
      priority: 2,
      approxWidth: 150,
      cell: ({ row }) => <span className="text-sm">{row.original.scope?.label ?? <span className={MUTED}>Not stated</span>}</span>,
    };
    const ns: AdaptiveColumn<InventoryRow> = {
      id: "namespace",
      header: "Namespace",
      priority: 3,
      approxWidth: 130,
      cell: ({ row }) => <span className={`text-xs ${MUTED}`}>{row.original.sub_scope ?? "Cluster-wide"}</span>,
    };
    const seen: AdaptiveColumn<InventoryRow> = {
      id: "seen",
      header: "Last confirmed",
      priority: 3,
      approxWidth: 140,
      cell: ({ row }) => (
        <span className={`text-sm ${MUTED}`} title="When the sweep behind this row confirmed it">
          <Timestamp iso={row.original.as_of ?? row.original.last_seen_at} />
        </span>
      ),
    };
    const actions: AdaptiveColumn<InventoryRow> = {
      id: "actions",
      header: "",
      alwaysVisible: true,
      approxWidth: 64,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ConsoleRowActions
            items={[
              { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
              { label: "Open details", onSelect: () => navigate(detailHref(row.original)) },
            ]}
          />
        </div>
      ),
    };
    const specific: AdaptiveColumn<InventoryRow>[] =
      type === "workloads"
        ? [
            {
              id: "runs_as",
              header: "Runs as",
              priority: 1,
              approxWidth: 220,
              cell: ({ row }) => (
                <Cell
                  e={wl}
                  id={refId(row.original.ref)}
                  render={(w: K8sWorkload) =>
                    w.runs_as ? (
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs" title={w.runs_as}>
                          {w.runs_as}
                        </p>
                        <p className={`text-[11px] ${MUTED}`}>{w.basis === "observed" ? "observed running" : "configured"}</p>
                      </div>
                    ) : (
                      <span className={MUTED}>Unresolved</span>
                    )
                  }
                />
              ),
            },
            {
              id: "access",
              header: "Cluster access",
              priority: 1,
              approxWidth: 130,
              cell: ({ row }) => (
                <Cell
                  e={wl}
                  id={refId(row.original.ref)}
                  render={(w: K8sWorkload) => (w.runs_as ? <span className="text-sm">{rules(w.grants)}</span> : <span className={MUTED}>Not calculated</span>)}
                />
              ),
            },
          ]
        : [
            {
              id: "access",
              header: "Cluster access",
              priority: 1,
              approxWidth: 190,
              cell: ({ row }) => (
                <Cell
                  e={ids}
                  id={refId(row.original.ref)}
                  render={(i: K8sIdentity) => (
                    <span className="text-sm">
                      {rules(i.grants)}
                      {i.wildcard ? <span className="ml-1.5 text-(--color-warning-text)">· wildcard</span> : null}
                      {i.stale ? <span className={`ml-1.5 ${MUTED}`}>· {i.stale} unconfirmed</span> : null}
                    </span>
                  )}
                />
              ),
            },
          ];
    return [name, ...specific, lifecycle, cluster, ns, seen, actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, wl, ids, selectedId, navigate]);

  const prefs = useColumnPreferences(`discovery-k8s-${type}`, columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();

  const kindOptions = reportedFacet(facets, "kind", (v) => kindLabel(v));
  const specs: FacetSpec[] = [
    {
      key: "source",
      label: "Source",
      kind: "choice",
      value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
      anyLabel: "Every cluster",
      ...sourceFacet(p.sources, facets?.scope),
      onChange: (v) => p.url.patch({ source: v }),
    },
    {
      key: "kind",
      label: type === "workloads" ? "Runtime" : "Kind",
      kind: "choice",
      value: kind,
      anyLabel: type === "workloads" ? "Any runtime" : "Any kind",
      ...kindOptions,
      onChange: (v) => p.url.patch({ kind: v }),
    },
    {
      key: "namespace",
      label: "Namespace",
      kind: "choice",
      value: namespace,
      anyLabel: "Any namespace",
      loadedOnly: true,
      options: namespaces.map(([v, n]) => ({ value: v, label: v, count: { kind: "exact" as const, value: n } })),
      onChange: (v) => p.url.patch({ namespace: v }),
    },
  ];

  const sweepOfRow = (r: InventoryRow) => inScope(sweeps, r.scope?.id)[0];

  const preview = (r: InventoryRow): PreviewModel => {
    const sweep = sweepOfRow(r);
    const facts: PreviewModel["facts"] =
      type === "workloads"
        ? [
            {
              label: "Runs as",
              value: <Cell e={wl} id={refId(r.ref)} render={(w: K8sWorkload) => (w.runs_as ? <span className="font-mono text-xs">{w.runs_as}</span> : <span className={MUTED}>Unresolved — not “none”</span>)} />,
            },
            {
              label: "Cluster access",
              value: <Cell e={wl} id={refId(r.ref)} render={(w: K8sWorkload) => (w.runs_as ? <span>{rules(w.grants)}</span> : <span className={MUTED}>Not calculated</span>)} />,
            },
          ]
        : [
            {
              label: "Cluster access",
              value: (
                <Cell
                  e={ids}
                  id={refId(r.ref)}
                  render={(i: K8sIdentity) => (
                    <span>
                      {rules(i.grants)}
                      {i.wildcard ? " · includes a wildcard" : ""}
                    </span>
                  )}
                />
              ),
            },
          ];
    return {
      key: refId(r.ref),
      name: r.name,
      kindLabel: `Kubernetes ${kindLabel(r.kind)}`,
      provider: "k8s",
      context: [r.scope ? `Cluster ${r.scope.label}` : "Cluster not stated", r.sub_scope ? `Namespace ${r.sub_scope}` : "Cluster-wide"],
      facts,
      exception:
        r.lifecycle === "retired"
          ? `Ended${r.retired_reason ? ` — ${r.retired_reason}` : ""}.`
          : r.state === "stale"
            ? "Stale: the latest sweep could not confirm it. It is still believed, not gone."
            : sweep && sweep.state !== "complete"
              ? `${K8S_COVERAGE_LABEL[sweep.state] ?? sweep.state}${sweep.limitation ? ` — ${sweep.limitation}` : ""}`
              : undefined,
      detailsHref: detailHref(r),
    };
  };

  const narrowing = [p.url.q && `search "${p.url.q}"`, p.scope.kind === "one" && `source ${p.scope.source.label}`, kind && `${type === "workloads" ? "runtime" : "kind"} ${kindLabel(kind)}`, namespace && `namespace ${namespace} (in the loaded rows)`].filter(Boolean) as string[];

  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider="k8s" onClear={() => p.url.patch({ source: null })} />;
  if (p.scope.kind === "no_rows") return <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} />;

  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={type === "workloads" ? "Search workloads by name or namespace/name" : "Search ServiceAccounts by name or namespace/name"}
      searchHint={p.url.qTooShort ? "Type at least 2 characters to search." : undefined}
      switcher={p.switcher}
      facets={specs}
      trailing={
        <>
          <SortSelect value={sort} options={[...SORTS]} onChange={(v) => p.url.patch({ sort: v === "name" ? null : v })} />
          <ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={layout} />
        </>
      }
      onClearAll={() => p.url.patch({ kind: null, namespace: null, source: null })}
      notices={
        <>
          {restarted ? (
            <p role="status" className="text-xs text-(--color-text-muted)">
              The list restarted at the first page: it changed while you were paging.
            </p>
          ) : null}
          {wl.state === "ready" && type === "workloads" && workloadsQ.data && workloadsQ.data.length >= 500 ? (
            <p className="text-xs text-(--color-text-muted)">What a workload runs as is read for the first 500 workloads; rows beyond them say Not available.</p>
          ) : null}
        </>
      }
    >
      {(width) => (
        <PreviewLayout
          width={width}
          model={selected ? preview(selected) : null}
          onClose={() => p.url.select(null)}
          list={
            <TableCard>
              <CardContent variant="flush">
                <DiscoveryTable<InventoryRow>
                  tableId={`discovery-k8s-${type}`}
                  view={view}
                  columns={columns}
                  getRowId={(r) => refId(r.ref)}
                  selectedId={selectedId}
                  onSelect={(r) => p.url.select(refId(r.ref))}
                  pageIndex={paging.pageIndex}
                  onPrev={paging.prev}
                  onNext={paging.next}
                  onRetry={() => void list.refetch()}
                  subject={type}
                  permission="iga:read"
                  chosenColumns={prefs.chosen}
                  onColumnsLayout={setLayout}
                  empty={
                    narrowing.length ? (
                      <FilteredEmpty subject={type} narrowing={narrowing} onClear={() => p.url.patch({ q: null, kind: null, namespace: null, source: null })} />
                    ) : sweeps.length && sweeps.every((s) => s.state === "not_swept") ? (
                      <EmptyList subject={type} detail="No inventory received yet: the cluster has not completed a sweep. This is not a finding that it holds none." />
                    ) : (
                      <EmptyList subject={type} detail="The latest sweep was read and recorded no Kubernetes objects of this type." />
                    )
                  }
                />
              </CardContent>
            </TableCard>
          }
        />
      )}
    </ScreenFrame>
  );
}
