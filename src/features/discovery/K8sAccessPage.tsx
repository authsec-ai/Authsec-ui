/**
 * Discovery → Kubernetes access
 *
 * "What can this agent actually do inside the cluster?"
 *
 * The answer is a chain — workload → ServiceAccount → binding → role → rule —
 * and this page shows it whole, because every link is somewhere a reviewer's
 * assumption breaks.
 *
 * THREE THINGS ON THIS PAGE ARE NOT DECORATION.
 *
 * Coverage. A sweep that could not read cluster-scoped objects has not given a
 * smaller answer, it has given a different one: ClusterRoleBindings are where
 * cluster-admin is granted, and they are exactly what it could not see. So
 * coverage is shown as a state with its own sentence, never averaged into a
 * percentage that invites the reader to assume the rest resembles what we have.
 *
 * Stale. A grant we could not re-read is still believed. Rendering it as gone
 * would turn a permissions outage into a revocation, which is the error that
 * gets acted on.
 *
 * Unresolved. A workload whose ServiceAccount we could not determine shows as
 * unresolved, not as zero access. "We don't know" and "it has none" are
 * opposite facts and must not share a row style.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Asterisk, Eye, FileWarning } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { tableFailure } from "@/components/console/load-failure";
import { MetricStrip, type MetricStripItemDef } from "@/components/console/MetricStrip";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerHeader,
  DrawerBody,
  DrawerSection,
  DetailGrid,
  DetailRow,
} from "@/components/console/detail";
import {
  useListK8sClustersQuery,
  useListK8sWorkloadsQuery,
  useGetK8sAccessQuery,
  type K8sWorkload,
  type K8sGrant,
} from "@/app/api/k8sGraphApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const SCOPE: ConsoleFilterOption[] = [
  { key: "all", label: "All workloads" },
  { key: "granted", label: "With access" },
  { key: "unresolved", label: "Unresolved identity" },
];

/** The coverage vocabulary, mirrored from internal/k8sread. Never a number. */
const COVERAGE_LABEL: Record<string, string> = {
  complete: "Fully swept",
  namespaced_only: "Namespaces only",
  incomplete: "Sweep incomplete",
  not_swept: "Never swept",
};

/**
 * An incomplete sweep and a namespaced-only one are not the same severity. The
 * first means a read FAILED, so nothing can be concluded anywhere; the second
 * means a known region of the cluster was not read. Rendering both as one
 * generic warning loses the distinction a responder needs first.
 */
const COVERAGE_BANNER: Record<string, string> = {
  namespaced_only:
    "border-l-(--color-warning-text) bg-(--color-warning-soft) text-(--color-warning-text)",
  incomplete:
    "border-l-(--color-danger-text) bg-(--color-danger-soft) text-(--color-danger-text)",
  not_swept: "border-l-border bg-muted text-muted-foreground",
};

export default function K8sAccessPage() {
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<K8sWorkload | null>(null);

  const clusters = useListK8sClustersQuery();
  const { data, isLoading, error, refetch } = useListK8sWorkloadsQuery();

  const rows = useMemo(() => data ?? [], [data]);

  /**
   * The worst coverage across clusters decides the banner. A workspace with one
   * fully-swept cluster and one blind cluster is not "mostly fine" — the blind
   * one is where an unknown cluster-admin binding would be.
   */
  const worst = useMemo(() => {
    const sweeps = (clusters.data?.clusters ?? [])
      .map((c) => c.last_sweep)
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (sweeps.length === 0) return null;
    const rank: Record<string, number> = {
      incomplete: 0,
      not_swept: 1,
      namespaced_only: 2,
      complete: 3,
    };
    return sweeps.reduce((a, b) => ((rank[a.coverage] ?? 9) <= (rank[b.coverage] ?? 9) ? a : b));
  }, [clusters.data]);

  const staleTotal = useMemo(
    () => (clusters.data?.clusters ?? []).reduce((n, c) => n + c.stale, 0),
    [clusters.data],
  );

  const metrics = useMemo<MetricStripItemDef[]>(() => {
    const withAccess = rows.filter((r) => r.grants > 0).length;
    const unresolved = rows.filter((r) => !r.runs_as).length;
    return [
      { key: "workloads", label: "Workloads", value: rows.length },
      { key: "granted", label: "With cluster access", value: withAccess, tone: "primary" },
      {
        key: "unresolved",
        label: "Identity unresolved",
        value: unresolved,
        tone: unresolved > 0 ? "warning" : "neutral",
        title: "We could not determine which ServiceAccount these run as — not that they have no access",
      },
      {
        key: "stale",
        label: "Grants unconfirmed",
        value: staleTotal,
        tone: staleTotal > 0 ? "warning" : "neutral",
        title: "Still believed; the last sweep could not re-read them",
      },
    ];
  }, [rows, staleTotal]);

  const items = useMemo(() => {
    let out = rows;
    if (scope === "granted") out = out.filter((r) => r.grants > 0);
    if (scope === "unresolved") out = out.filter((r) => !r.runs_as);
    const q = search.trim().toLowerCase();
    if (!q) return out;
    return out.filter((r) =>
      [r.display_name, r.namespace, r.runs_as ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [rows, scope, search]);

  const columns = useMemo<AdaptiveColumn<K8sWorkload>[]>(
    () => [
      {
        id: "workload",
        header: "Workload",
        primary: true,
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="truncate text-xs font-medium text-foreground">
              {row.original.display_name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {row.original.namespace || "—"}
            </span>
          </div>
        ),
      },
      {
        id: "runs_as",
        header: "Runs as",
        priority: 1,
        approxWidth: 280,
        cell: ({ row }) =>
          row.original.runs_as ? (
            <div className="flex flex-col">
              <span className="truncate font-mono text-[11px] text-foreground">
                {row.original.runs_as}
              </span>
              {/* The basis is the difference between "we saw this Pod running
                  as it" and "its manifest says so". Both are useful; conflating
                  them is not. */}
              <span className="text-[11px] text-muted-foreground">
                {row.original.basis === "observed" ? "observed running" : "configured"}
              </span>
            </div>
          ) : (
            <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
              <FileWarning className="h-3 w-3" />
              Unresolved
            </span>
          ),
      },
      {
        id: "grants",
        header: "Cluster access",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => {
          const n = row.original.grants;
          if (!row.original.runs_as) {
            return <span className="text-xs text-muted-foreground">Not calculated</span>;
          }
          return (
            <span className="text-xs text-foreground">
              {n} {n === 1 ? "rule" : "rules"}
            </span>
          );
        },
      },
      {
        id: "lifecycle",
        header: "State",
        priority: 3,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.lifecycle}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Kubernetes access"
      description="What each workload can do inside the cluster, through the ServiceAccount it runs as."
    >
      {worst && worst.coverage !== "complete" ? (
        <div
          className={`rounded-md border-l-2 px-4 py-3 text-xs ${
            COVERAGE_BANNER[worst.coverage] ?? COVERAGE_BANNER.not_swept
          }`}
        >
          <strong className="font-medium">
            {COVERAGE_LABEL[worst.coverage] ?? worst.coverage}.
          </strong>{" "}
          <span className="text-foreground/80">{worst.limitation}</span>
        </div>
      ) : null}

      <MetricStrip items={metrics} />

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by workload, namespace, or ServiceAccount…"
        filters={SCOPE}
        activeFilter={scope}
        onFilterChange={setScope}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "Kubernetes workloads", () => refetch(), "discovery:read")}
            tableId="k8s-access"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            onRowClick={(r) => setSelected(r)}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <AccessDrawer workload={selected} onClose={() => setSelected(null)} />
    </ConsolePage>
  );
}

/** The chain behind one workload's access, rule by rule. */
function AccessDrawer({
  workload,
  onClose,
}: {
  workload: K8sWorkload | null;
  onClose: () => void;
}) {
  const { data, isFetching } = useGetK8sAccessQuery(workload?.runs_as_id ?? "", {
    skip: !workload?.runs_as_id,
  });

  return (
    <RightDrawer
      open={Boolean(workload)}
      onClose={onClose}
      width={620}
      ariaTitle="Workload access"
      ariaDescription="The ServiceAccount this workload runs as, and every rule reachable from it."
    >
      {workload ? (
        <>
          <DrawerHeader
            title={workload.display_name}
            subtitle={workload.namespace || undefined}
          />
          <DrawerBody>
            <DrawerSection label="Execution identity">
              <DetailGrid>
                <DetailRow label="Namespace" value={workload.namespace || "—"} />
                <DetailRow
                  label="Basis"
                  value={workload.basis === "observed" ? "Observed running" : "Configured"}
                />
                <DetailRow
                  full
                  mono
                  label="Runs as"
                  value={workload.runs_as || "Not resolved"}
                />
              </DetailGrid>
            </DrawerSection>

            {!workload.runs_as ? (
              <DrawerSection label="Access">
                <p className="text-xs text-muted-foreground">
                  This workload&apos;s ServiceAccount could not be resolved, so its access
                  was <strong className="font-medium">not calculated</strong>. That is not
                  the same as having none.
                </p>
              </DrawerSection>
            ) : (
              <DrawerSection label={`Rules (${data?.grants.length ?? 0})`}>
                {isFetching ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (data?.grants.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No rules reach this ServiceAccount in what has been swept.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data!.grants.map((g, i) => (
                      <GrantRow key={`${g.binding}:${g.role_name}:${i}`} grant={g} />
                    ))}
                  </div>
                )}
                {data?.summary ? (
                  <p className="mt-3 border-t border-border pt-2 text-[11px] leading-4 text-muted-foreground">
                    {data.summary.note}
                    {data.summary.partial > 0 ? (
                      <>
                        {" "}
                        <strong className="font-medium">
                          {data.summary.partial} of these could not be fully resolved
                        </strong>{" "}
                        — the role was not in the sweep, so what it grants is unknown.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </DrawerSection>
            )}
          </DrawerBody>
        </>
      ) : null}
    </RightDrawer>
  );
}

function GrantRow({ grant }: { grant: K8sGrant }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-foreground">
          {grant.role_name || "unknown role"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {grant.role_kind === "k8s_cluster_role" ? "ClusterRole" : "Role"}
          {grant.namespace ? ` · ${grant.namespace}` : " · cluster-wide"}
        </span>
        {grant.wildcard ? (
          <span className={`${PILL} bg-(--color-danger-soft) text-(--color-danger-text)`}>
            <Asterisk className="h-3 w-3" />
            Wildcard
          </span>
        ) : null}
        {grant.constrained ? (
          <span className={`${PILL} bg-muted text-muted-foreground`}>
            <Eye className="h-3 w-3" />
            Named instances only
          </span>
        ) : null}
        {grant.state === "stale" ? (
          <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
            <AlertTriangle className="h-3 w-3" />
            Unconfirmed
          </span>
        ) : null}
      </div>
      <p className="font-mono text-[11px] leading-4 text-muted-foreground">
        {(grant.verbs ?? []).join(", ") || "—"}
        {" on "}
        {(grant.resources ?? []).join(", ") || "—"}
        {grant.api_groups?.length ? ` (${grant.api_groups.map((g) => g || "core").join(", ")})` : ""}
      </p>
      {grant.resource_names?.length ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Limited to: {grant.resource_names.join(", ")}
        </p>
      ) : null}
      {grant.calculation_state !== "complete" ? (
        <p className="mt-1 text-[11px] text-(--color-warning-text)">
          The role behind this binding was not in the sweep, so what it grants is unknown.
        </p>
      ) : null}
    </div>
  );
}
