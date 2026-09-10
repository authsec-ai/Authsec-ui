/**
 * Discovery → AWS Compute
 *
 * The compute AuthSec found running as a discovered identity — Lambda
 * functions, ECS task definitions, EC2 instances, Bedrock agents and AgentCore
 * runtimes — and, prominently, the compute it could NOT attribute to any role
 * it discovered.
 *
 * ── Why this is a page and not only a tab ───────────────────────────────────
 *
 * Attributed compute has a natural home: the Compute tab of an identity's own
 * drawer. Unattributed compute has none — there is no identity to hang it off,
 * which is exactly why it deserves top billing. `GET /aws/workloads` returns
 * `meta.unattributed` as a first-class count for the same reason, and burying
 * those rows inside per-identity views would hide the only rows nobody owns.
 *
 * ── Terminology ─────────────────────────────────────────────────────────────
 *
 * Called "Compute", not "Workloads". AGENTS.md reserves "Workload" for
 * Kubernetes/SPIFFE pod identities and forbids drifting the word; these rows
 * are AWS compute resources, which is what AWS's own documentation calls them.
 * The backend table and field names (`cloud_workload`, `runtime_kind`) are
 * untouched — only the user-facing label differs.
 *
 * ── Scope limits this page is honest about ──────────────────────────────────
 *
 * `GET /aws/workloads` takes `identity_id` only. It has no `connector_id`
 * filter and no pagination, so this page always receives every workload in the
 * workspace across every connected account, and every filter below is
 * client-side over that full set. With more than one account connected the
 * page says so rather than implying an account scope it cannot apply.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Boxes, CircleSlash } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { MetricStrip, type MetricStripItemDef } from "@/components/console/MetricStrip";
import {
  ConsoleFilterBar,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "react-hot-toast";
import {
  useListAwsConnectorsQuery,
  useListAwsIdentityPageQuery,
  useListAwsWorkloadsQuery,
  useScanAwsConnectorMutation,
  type AWSWorkloadAttrs,
  type CloudIdentity,
  type CloudRuntimeKind,
  type CloudWorkload,
} from "@/app/api/cloudDiscoveryApi";

import { AWSIdentityDrawer } from "./AWSIdentityDrawer";
import {
  RUNTIME_KIND_LABEL,
  RUNTIME_KIND_SHORT,
  RUNTIME_KINDS,
} from "./awsInventoryLabels";
import {
  ComputeCaveat,
  InventoryEmptyState,
  StaleStackNotice,
  WorkspaceScopeCaveat,
} from "./AWSInventoryNotices";
import { inventoryEmptyReason } from "./awsInventoryState";
import { awsErrorCopy } from "./awsErrorCopy";

/** Identities are fetched only to resolve `identity_id` to a readable name.
 * 500 is the server's clamp; beyond it a name may not resolve, and the page
 * says so rather than rendering a blank cell as if the row were unattributed. */
const IDENTITY_LOOKUP_LIMIT = 500;

type AttributionFilter = "all" | "attributed" | "unattributed";

const ATTRIBUTION_FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "attributed", label: "Attributed" },
  { key: "unattributed", label: "Unattributed" },
];

function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

export default function AWSComputePage() {
  const [params, setParams] = useSearchParams();

  const attribution = (() => {
    const raw = params.get("attribution");
    return raw === "attributed" || raw === "unattributed" ? raw : "all";
  })() as AttributionFilter;

  const runtimeParam = params.get("runtime");
  const runtime = RUNTIME_KINDS.includes(runtimeParam as CloudRuntimeKind)
    ? (runtimeParam as CloudRuntimeKind)
    : null;

  const [search, setSearch] = useState("");
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  /** Clears both filters in ONE update.
   *
   * Two back-to-back `setParam` calls do not compose: each builds a fresh
   * URLSearchParams from the `params` captured in this render, so the second
   * call's object never contains the first's deletion and silently reverts it.
   * The "Compute resources" tile needs both gone, so it needs one write. */
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    next.delete("attribution");
    next.delete("runtime");
    setParams(next, { replace: true });
  };

  const connectorsQuery = useListAwsConnectorsQuery();
  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data]);

  const workloadsQuery = useListAwsWorkloadsQuery();
  const rows = useMemo(() => workloadsQuery.data?.rows ?? [], [workloadsQuery.data]);

  // `unattributed` and `by_runtime_kind` are the server's own tallies over the
  // full set. Read them rather than recomputing: if this endpoint is ever
  // paginated, a client-side count would quietly start disagreeing.
  const meta = workloadsQuery.data?.meta;

  const identitiesQuery = useListAwsIdentityPageQuery({ limit: IDENTITY_LOOKUP_LIMIT, offset: 0 });
  const identityById = useMemo(
    () => new Map((identitiesQuery.data?.rows ?? []).map((i) => [i.id, i])),
    [identitiesQuery.data],
  );
  const identityLookupTruncated =
    (identitiesQuery.data?.total ?? 0) > (identitiesQuery.data?.rows.length ?? 0);

  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const [scanConnector, { isLoading: scanning }] = useScanAwsConnectorMutation();

  const handleScan = async (connectorId: string) => {
    try {
      await scanConnector(connectorId).unwrap();
      toast.success("Scan started — it runs in the background.");
    } catch (err) {
      const copy = awsErrorCopy(
        (err as { data?: Parameters<typeof awsErrorCopy>[0] })?.data,
        "Could not start the scan.",
      );
      toast.error(`${copy.title}. ${copy.body}`);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((w) => {
      if (attribution === "attributed" && !w.identity_id) return false;
      if (attribution === "unattributed" && w.identity_id) return false;
      if (runtime && w.runtime_kind !== runtime) return false;
      if (!q) return true;
      const attrs = w.attrs as AWSWorkloadAttrs;
      return (
        w.name.toLowerCase().includes(q) ||
        w.native_id.toLowerCase().includes(q) ||
        w.region.toLowerCase().includes(q) ||
        (attrs?.unresolved_role_arn ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, attribution, runtime]);

  const selected: CloudIdentity | null = selectedIdentityId
    ? identityById.get(selectedIdentityId) ?? null
    : null;

  // If the identity lookup has not resolved (or was truncated past 500), the
  // drawer would open empty. Close it rather than show a blank panel.
  useEffect(() => {
    if (selectedIdentityId && !identityById.has(selectedIdentityId)) {
      setSelectedIdentityId(null);
    }
  }, [selectedIdentityId, identityById]);

  const metrics = useMemo<MetricStripItemDef[]>(() => {
    const total = meta?.count ?? rows.length;
    const unattributed = meta?.unattributed ?? 0;
    const regions = new Set(rows.map((w) => w.region).filter(Boolean)).size;
    return [
      {
        key: "total",
        label: "Compute resources",
        value: total,
        tone: "primary",
        onClick: clearFilters,
      },
      {
        key: "attributed",
        label: "Run as a known identity",
        value: total - unattributed,
        tone: "success",
        onClick: () => setParam("attribution", "attributed"),
      },
      {
        key: "unattributed",
        label: "Unattributed",
        value: unattributed,
        tone: unattributed > 0 ? "warning" : "neutral",
        onClick: () => setParam("attribution", "unattributed"),
      },
      { key: "regions", label: regions === 1 ? "Region" : "Regions", value: regions },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, meta, params]);

  /** Runtime pills carry the server's own per-kind counts, and a kind with no
   * rows is offered but shown as 0 rather than hidden — an absent Bedrock
   * filter would read as "AuthSec does not look for Bedrock agents". */
  const runtimeFilters = useMemo<ConsoleFilterOption[]>(
    () => [
      { key: "all", label: "All runtimes" },
      ...RUNTIME_KINDS.map((k) => ({
        key: k,
        label: RUNTIME_KIND_SHORT[k],
        count: meta?.by_runtime_kind?.[k] ?? 0,
      })),
    ],
    [meta],
  );

  const columns = useMemo<AdaptiveColumn<CloudWorkload>[]>(
    () => [
      {
        id: "compute",
        accessorKey: "name",
        header: "Compute",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 300,
        cell: ({ row }) => {
          const w = row.original;
          return (
            <EntityCell
              label={w.name || w.native_id}
              detail={w.native_id}
              monoDetail
              badge={
                <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  {RUNTIME_KIND_SHORT[w.runtime_kind]}
                </span>
              }
            />
          );
        },
      },
      {
        id: "runs_as",
        header: "Runs as",
        alwaysVisible: true,
        priority: 2,
        approxWidth: 260,
        cell: ({ row }) => {
          const w = row.original;
          const attrs = w.attrs as AWSWorkloadAttrs;

          // Null identity_id is the finding: compute naming a role that this
          // scan did not discover. `unresolved_role_arn` says which role it
          // was looking for, so the row is actionable rather than just blank.
          if (!w.identity_id) {
            return (
              <div className="min-w-0">
                <StatusBadge tone="warning" dot={false}>
                  Unattributed
                </StatusBadge>
                {attrs?.unresolved_role_arn ? (
                  <p
                    className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground"
                    title={attrs.unresolved_role_arn}
                  >
                    names {attrs.unresolved_role_arn}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                    no execution role reported
                  </p>
                )}
              </div>
            );
          }

          const identity = identityById.get(w.identity_id);
          if (!identity) {
            return (
              <span className="text-xs text-muted-foreground">
                {identitiesQuery.isLoading ? "…" : "A discovered identity"}
              </span>
            );
          }
          return (
            <span className="truncate text-xs text-foreground" title={identity.native_id}>
              {identity.name || identity.native_id}
            </span>
          );
        },
      },
      {
        id: "runtime",
        accessorKey: "runtime_kind",
        header: "Runtime",
        priority: 5,
        approxWidth: 170,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {RUNTIME_KIND_LABEL[row.original.runtime_kind]}
          </span>
        ),
      },
      {
        id: "region",
        accessorKey: "region",
        header: "Region",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.region || "—"}
          </span>
        ),
      },
      {
        id: "account",
        header: "Account",
        priority: 6,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {connectorById.get(row.original.connector_id)?.scope_id ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Reported status",
        priority: 4,
        approxWidth: 140,
        cell: ({ row }) => {
          const attrs = row.original.attrs as AWSWorkloadAttrs;
          // The provider's own lifecycle string, verbatim — never mapped to a
          // tone, because AWS uses a different vocabulary per service and
          // guessing which of them mean "healthy" would be inventing a verdict.
          return (
            <span className="text-xs text-muted-foreground">
              {attrs?.status || "—"}
            </span>
          );
        },
      },
      {
        id: "last_seen",
        header: "Last seen",
        priority: 7,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeOrUnknown(row.original.last_seen_at)}
          </span>
        ),
      },
    ],
    [connectorById, identityById, identitiesQuery.isLoading],
  );

  const emptyReason = inventoryEmptyReason(connectors, "compute");
  const loading = workloadsQuery.isLoading || connectorsQuery.isLoading;
  const unattributed = meta?.unattributed ?? 0;

  return (
    <ConsolePage
      title="AWS Compute"
      description="Lambda functions, ECS task definitions, EC2 instances and Bedrock agents discovered in your AWS accounts, and the identity each one runs as."
    >
      {workloadsQuery.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load compute.</strong>{" "}
          {(workloadsQuery.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : (workloadsQuery.error as { status?: number })?.status === 404
              ? "This deployment's API does not expose /aws/workloads yet."
              : "The AWS discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void workloadsQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? <MetricStrip items={metrics} /> : null}

      <StaleStackNotice connectors={connectors} />
      <WorkspaceScopeCaveat accountCount={connectors.length} />

      {unattributed > 0 ? (
        <div className="flex items-start gap-2 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-[11.5px] leading-relaxed text-(--color-warning-text)">
          <CircleSlash className="mt-px size-3.5 flex-none" aria-hidden />
          <div>
            <strong className="font-medium">
              {unattributed === 1
                ? "1 compute resource could not be tied to a discovered identity."
                : `${unattributed} compute resources could not be tied to a discovered identity.`}
            </strong>{" "}
            Each names an execution role this scan did not find — a role in another account, one
            deleted since, or one the scan could not read. Compute nobody can attribute is a
            finding, not missing data.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setParam("attribution", "unattributed")}
            >
              Show only these
            </button>
          </div>
        </div>
      ) : null}

      <ComputeCaveat />

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, ARN or region…"
        filters={ATTRIBUTION_FILTERS}
        activeFilter={attribution}
        onFilterChange={(v) => setParam("attribution", v)}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {runtimeFilters.map((f) => {
          const active = f.key === "all" ? runtime === null : runtime === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setParam("runtime", f.key === "all" ? null : f.key)}
              className={
                active
                  ? "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent bg-(--color-primary-soft) px-2.5 text-[11px] font-semibold text-(--color-primary-text)"
                  : "inline-flex h-7 items-center gap-1.5 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-[11px] font-medium text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
              }
            >
              {f.label}
              {f.count !== undefined ? (
                <span className="tabular-nums text-muted-foreground">{f.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <TableCard>
        <CardContent variant="flush">
          {loading ? (
            <div className="p-4">
              <DataTableSkeleton columns={5} rows={6} showSelection={false} showActions={false} />
            </div>
          ) : !rows.length ? (
            <InventoryEmptyState
              reason={emptyReason}
              surface="compute"
              onScan={(id) => void handleScan(id)}
              scanning={scanning}
            />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto mb-2.5 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Boxes className="size-5" />
              </span>
              <p className="text-sm font-semibold text-foreground">No compute matches</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {attribution === "unattributed"
                  ? "Every compute resource discovered is attributed to a known identity."
                  : runtime
                    ? `No ${RUNTIME_KIND_LABEL[runtime]} was discovered in the connected accounts.`
                    : "Nothing matches that search."}
              </p>
            </div>
          ) : (
            <AdaptiveTable
              tableId="aws-compute"
              columns={columns}
              data={filtered}
              getRowId={(w) => w.id}
              enableSelection={false}
              enableExpansion={false}
              // Attributed rows lead to the identity, because "what may this
              // role do" is the question compute makes actionable. An
              // unattributed row has no identity to open, so it stays inert —
              // and its own cell already shows the ARN it was looking for.
              onRowClick={(w) => {
                if (w.identity_id) setSelectedIdentityId(w.identity_id);
              }}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {identityLookupTruncated ? (
        <p className="text-[11px] text-muted-foreground">
          More identities exist than one request returns, so some "Runs as" names may show as “A
          discovered identity” rather than resolving. The attribution itself is the backend's, and
          is correct either way.
        </p>
      ) : null}

      <AWSIdentityDrawer identity={selected} onClose={() => setSelectedIdentityId(null)} />
    </ConsolePage>
  );
}
