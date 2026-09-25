/**
 * Discovery → AWS Resources
 *
 * The things a permission points AT: a specific S3 bucket, a specific DynamoDB
 * table, a specific KMS key, a specific Secrets Manager secret. Not the
 * identity that holds the grant (AWS Identities) and not the compute that runs
 * as it (AWS Compute) — the target.
 *
 * ── Why this is not a tab on an IDENTITY ────────────────────────────────────
 *
 * The backend's own boundary decides it. Of the seven `/authsec/discovery/aws/*`
 * list endpoints, five accept `identity_id` and are rendered as tabs inside the
 * identity drawer. Two do not — `/aws/identities` and `/aws/resources` — and
 * both are account-grained. `cloud_resource` has no `identity_id` column at
 * all, and the repository is explicit that this is deliberate: "a resource is
 * reached through cloud_permission, not owned by one identity".
 *
 * Hanging resources off one identity would invert that. It is also what the
 * console already does by necessity in PermissionsTab, which fetches every
 * resource in the connector purely to label one statement row — a lookup, not
 * a view.
 *
 * It IS a tab of CloudInventoryLayout, which is a different thing entirely:
 * that shell sits at account grain, not identity grain, and owns the page
 * header and tab strip — so this file begins at the body.
 *
 * ── How much data this page loads, and why ──────────────────────────────────
 *
 * Same trade as AWSIdentitiesPage: every AWS discovery endpoint caps a response
 * at 500 rows and the endpoint has no search parameter, so the honest options
 * were server-side paging with no working search, or one request at the
 * server's own maximum with search done client-side over what came back. This
 * takes the second, and `meta.total` makes the shortfall sayable.
 *
 * One difference from the identities page, and it matters for the copy:
 * `/aws/resources` accepts ONLY `connector_id`, `limit` and `offset`. It has no
 * `kind` parameter. So the account picker filters server-side and the type
 * pills do not — the truncation notice must name only the former.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Info } from "lucide-react";

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
import { CloudPill } from "../CloudPill";
import {
  useListAwsConnectorsQuery,
  useListAwsObservationsQuery,
  useListAwsResourcesQuery,
  useScanAwsConnectorMutation,
  AWS_DISCOVERY_MAX_LIMIT,
  type CloudResource,
} from "@/app/api/cloudDiscoveryApi";
import { toast } from "react-hot-toast";

import { AWSAccountPicker } from "./AWSAccountPicker";
import {
  ALL_ACCOUNTS,
  metricLabel,
  resourceKindLabel,
  SENSITIVITY_LABEL,
  SENSITIVITY_TONE,
} from "./awsInventoryLabels";
import { AWSResourceDrawer } from "./AWSResourceDrawer";
import {
  InventoryEmptyState,
  ResourceScopeCaveat,
  TruncationNotice,
} from "./AWSInventoryNotices";
import { inventoryEmptyReason, truncationOf } from "./awsInventoryState";
import { awsErrorCopy } from "./awsErrorCopy";
import {
  resourcePolicyFacts,
  SOURCE_KMS_KEY_POLICY,
  SOURCE_S3_BUCKET_POLICY,
} from "./awsObservationFacts";

const ALL_KINDS = "all";

export default function AWSResourcesPage() {
  const [params, setParams] = useSearchParams();

  // URL-backed so an inventory view is shareable, the same as the sibling
  // AWS pages.
  const account = params.get("account") ?? ALL_ACCOUNTS;
  // `kind` is free text server-side (the column is text, not an enum, so AWS
  // shipping a new service never needs a migration). Nothing is validated
  // against a fixed union here for the same reason — an unknown value simply
  // matches no row, and the "no resources match" state says so.
  const kind = params.get("kind") ?? ALL_KINDS;

  const [search, setSearch] = useState("");
  const [highOnly, setHighOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === ALL_ACCOUNTS || value === ALL_KINDS) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const connectorsQuery = useListAwsConnectorsQuery();
  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data]);

  const resourcesQuery = useListAwsResourcesQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
    // No `kind` here on purpose: the endpoint does not accept one. See the
    // header — filtering by type happens in `filtered` below.
    limit: AWS_DISCOVERY_MAX_LIMIT,
    offset: 0,
  });

  /**
   * Resource-policy denies, for the Policy column.
   *
   * Two queries because `/aws/observations` has no `connector_id` filter — the
   * only account-wide handle is `source_api`, and a bucket policy and a key
   * policy are two different source APIs. Both are capped like every other read
   * on this page.
   *
   * The result is a Set of resource ids known to carry a deny, plus a Set of
   * ids whose policy was READ AT ALL. The second is what keeps the column
   * honest: a resource missing from it renders unknown, not "no deny".
   */
  const s3PolicyQuery = useListAwsObservationsQuery({
    source_api: SOURCE_S3_BUCKET_POLICY,
    limit: AWS_DISCOVERY_MAX_LIMIT,
  });
  const kmsPolicyQuery = useListAwsObservationsQuery({
    source_api: SOURCE_KMS_KEY_POLICY,
    limit: AWS_DISCOVERY_MAX_LIMIT,
  });

  const { denyIds, readIds } = useMemo(() => {
    const deny = new Set<string>();
    const read = new Set<string>();
    // Only the NEWEST observation per (resource, source API) describes the
    // policy as it stands. `content_hash` is part of the dedupe key, so an
    // edited policy writes a new row and the old one survives — observations
    // are durable evidence, not reconciled inventory. Taking every row would
    // keep flagging a deny that has since been removed.
    //
    // Each query returns `observed_at DESC`, so the first row seen for a key is
    // the current one and later rows for that key are history.
    const seen = new Set<string>();
    for (const o of [
      ...(s3PolicyQuery.data?.rows ?? []),
      ...(kmsPolicyQuery.data?.rows ?? []),
    ]) {
      if (!o.resource_id) continue;
      const key = `${o.resource_id}|${o.source_api}`;
      if (seen.has(key)) continue;
      seen.add(key);
      read.add(o.resource_id);
      if (resourcePolicyFacts(o).hasDeny === true) deny.add(o.resource_id);
    }
    return { denyIds: deny, readIds: read };
  }, [s3PolicyQuery.data, kmsPolicyQuery.data]);

  /** These two reads resolve independently of the resource list, so the column
   * must be able to say "not yet" and "failed" rather than answering from an
   * empty result set. */
  const policyReadPending = s3PolicyQuery.isLoading || kmsPolicyQuery.isLoading;
  const policyReadFailed = s3PolicyQuery.isError || kmsPolicyQuery.isError;

  /** True when either policy read fell short, so the column's blanks may be
   * truncation rather than genuine absence. */
  const policyReadIncomplete =
    (s3PolicyQuery.data ? truncationOf(s3PolicyQuery.data).truncated : false) ||
    (kmsPolicyQuery.data ? truncationOf(kmsPolicyQuery.data).truncated : false);

  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  // Wrapped rather than inlined: `?? []` builds a new array identity on every
  // render, which would invalidate every useMemo below it each time.
  const rows = useMemo(() => resourcesQuery.data?.rows ?? [], [resourcesQuery.data]);
  const total = resourcesQuery.data?.total ?? 0;
  const truncated = total > rows.length;

  const [scanConnector, { isLoading: scanning }] = useScanAwsConnectorMutation();

  const handleScan = async (connectorId: string) => {
    try {
      await scanConnector(connectorId).unwrap();
      toast.success("Scan queued — it runs in the background. Its results appear here when it finishes.");
    } catch (err) {
      const copy = awsErrorCopy(
        (err as { data?: Parameters<typeof awsErrorCopy>[0] })?.data,
        "Could not start the scan.",
      );
      toast.error(`${copy.title}. ${copy.body}`);
    }
  };

  // Built from the kinds actually present rather than a hard-coded list: the
  // backend types a resource by service (`s3_bucket`, `dynamodb_table`,
  // `kms_key`, `secretsmanager_secret`, and whatever a policy names next), so a
  // fixed pill row would either hide a real kind or offer empty ones.
  const kindFilters = useMemo<ConsoleFilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    return [
      { key: ALL_KINDS, label: "All", count: rows.length },
      ...[...counts.entries()]
        .sort(([a], [b]) => resourceKindLabel(a).localeCompare(resourceKindLabel(b)))
        .map(([k, n]) => ({ key: k, label: resourceKindLabel(k), count: n })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== ALL_KINDS && r.kind !== kind) return false;
      if (highOnly && r.sensitivity !== "high") return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.native_id.toLowerCase().includes(q);
    });
  }, [rows, search, kind, highOnly]);

  // The drawer's pager steps through what the reader can actually see.
  const selectedIndex = filtered.findIndex((r) => r.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  // A row that scrolls out of the filtered set (search narrowed, filter
  // changed) must not leave a drawer open on something no longer listed.
  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const metrics = useMemo<MetricStripItemDef[]>(() => {
    const kinds = new Set(rows.map((r) => r.kind)).size;
    const high = rows.filter((r) => r.sensitivity === "high").length;
    const med = rows.filter((r) => r.sensitivity === "med").length;
    return [
      {
        key: "total",
        label: metricLabel("Resources", truncated, rows.length),
        value: total,
        tone: "primary",
        onClick: () => {
          setParam("kind", null);
          setHighOnly(false);
        },
      },
      {
        key: "kinds",
        // Counted over the loaded rows, like every tile here — a type present
        // only beyond the cap cannot be counted, which is what the truncation
        // qualifier in the label is for.
        label: metricLabel("Resource types", truncated, rows.length),
        value: kinds,
      },
      {
        key: "high",
        label: metricLabel("High sensitivity", truncated, rows.length),
        value: high,
        tone: high > 0 ? "danger" : "neutral",
        onClick: () => setHighOnly(true),
      },
      {
        key: "med",
        label: metricLabel("Medium sensitivity", truncated, rows.length),
        value: med,
        tone: med > 0 ? "warning" : "neutral",
      },
    ];
    // setParam closes over `params`; rebuilding the strip when it changes is
    // correct and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, total, truncated, params]);

  const columns = useMemo<AdaptiveColumn<CloudResource>[]>(
    () => [
      {
        id: "resource",
        accessorKey: "name",
        header: "Resource",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 320,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <EntityCell
              label={r.name || r.native_id}
              detail={r.native_id}
              monoDetail
              badge={
                <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {resourceKindLabel(r.kind)}
                </span>
              }
            />
          );
        },
      },
      {
        id: "sensitivity",
        accessorKey: "sensitivity",
        header: "Sensitivity",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => {
          const s = row.original.sensitivity;
          // Same idiom as PermissionsTab: a "low" pill says nothing, so low
          // renders as plain muted text and only med/high get a badge.
          return s === "low" ? (
            <span className="text-xs text-muted-foreground">{SENSITIVITY_LABEL[s]}</span>
          ) : (
            <CloudPill tone={SENSITIVITY_TONE[s]} dot={false}>
              {SENSITIVITY_LABEL[s]}
            </CloudPill>
          );
        },
      },
      {
        // The resource's OWN policy. A deny here blocks access that every
        // identity-side grant would otherwise allow, so it belongs in the list
        // rather than only behind a row click — a bucket silently blocking an
        // identity is the finding, and it is invisible until you look.
        id: "policy",
        header: "Policy",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => {
          const id = row.original.id;

          // Four states, kept apart deliberately. The policy reads are separate
          // queries from the resource list and resolve later, so collapsing
          // "still loading" or "the read failed" into "no policy was read"
          // would assert a fact about the account from the console's own
          // request timing.
          if (policyReadPending) {
            return <span className="text-xs text-muted-foreground">…</span>;
          }
          if (policyReadFailed) {
            return (
              <span
                className="text-xs text-muted-foreground"
                title="The resource-policy read failed, so whether this resource denies access is unknown."
              >
                Unavailable
              </span>
            );
          }
          if (denyIds.has(id)) {
            return (
              <CloudPill tone="danger" dot={false}>
                Deny
              </CloudPill>
            );
          }
          // Read and clean.
          if (readIds.has(id)) return <span className="text-xs text-muted-foreground">None</span>;
          // Read succeeded but named no policy for this resource. Still unknown,
          // never "no deny".
          return (
            <span
              className="text-xs text-muted-foreground"
              title={
                policyReadIncomplete
                  ? "The resource-policy read was truncated, so this resource's policy may simply not have loaded."
                  : "No resource policy was read for this resource."
              }
            >
              —
            </span>
          );
        },
      },
      {
        id: "last_seen",
        accessorKey: "last_seen_at",
        header: "Last seen",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground"
            title={new Date(row.original.last_seen_at).toLocaleString()}
          >
            {formatDistanceToNow(new Date(row.original.last_seen_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "account",
        header: "Account",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => {
          const connector = connectorById.get(row.original.connector_id);
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {connector?.scope_id ?? "—"}
            </span>
          );
        },
      },
      {
        id: "first_seen",
        accessorKey: "first_seen_at",
        header: "First seen",
        priority: 6,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.first_seen_at), { addSuffix: true })}
          </span>
        ),
      },
    ],
    [connectorById, denyIds, readIds, policyReadIncomplete, policyReadPending, policyReadFailed],
  );

  const liveConnectors = useMemo(
    () => (account === ALL_ACCOUNTS ? connectors : connectors.filter((c) => c.id === account)),
    [connectors, account],
  );

  const emptyReason = inventoryEmptyReason(liveConnectors, "resources");
  const loading = resourcesQuery.isLoading || connectorsQuery.isLoading;

  return (
    // The page header and tab strip belong to CloudInventoryLayout; this is the
    // tab body. Keeps ConsolePage's own body rhythm so spacing is unchanged.
    <div className="space-y-4">
      {resourcesQuery.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the resource inventory.</strong>{" "}
          {(resourcesQuery.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The AWS discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void resourcesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? <MetricStrip items={metrics} /> : null}

      {resourcesQuery.data ? (
        <TruncationNotice
          truncation={truncationOf(resourcesQuery.data)}
          noun="resources"
          // Only the account picker is named: `/aws/resources` takes no `kind`
          // parameter, so the type pills narrow the loaded page and would not
          // bring a single extra row back.
          narrowBy="Narrow by account first — that is the only filter this endpoint applies server-side. The type pills and search narrow the rows already loaded."
        />
      ) : null}

      <ResourceScopeCaveat />

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or ARN…"
        filters={kindFilters}
        activeFilter={kind}
        onFilterChange={(v) => setParam("kind", v === ALL_KINDS ? null : v)}
        trailing={
          <>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
              <input
                id="aws-resources-high-only"
                type="checkbox"
                checked={highOnly}
                onChange={(e) => setHighOnly(e.target.checked)}
                className="size-3.5 accent-(--color-primary)"
              />
              High sensitivity only
            </label>
            <AWSAccountPicker
              connectors={connectors}
              value={account}
              onChange={(next) => setParam("account", next)}
            />
          </>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {loading ? (
            <div className="p-4">
              <DataTableSkeleton columns={5} rows={6} showSelection={false} showActions={false} />
            </div>
          ) : resourcesQuery.isError && !rows.length ? (
            // The banner above says what failed; an empty-inventory message
            // here would claim there is nothing to find.
            <p className="px-6 py-10 text-center text-xs text-muted-foreground">
              Nothing is listed because the request failed — this is not an empty inventory.
            </p>
          ) : !rows.length ? (
            <InventoryEmptyState
              reason={emptyReason}
              surface="resources"
              onScan={(id) => void handleScan(id)}
              scanning={scanning}
            />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">No resources match</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {highOnly
                  ? "No loaded resource is rated high sensitivity. Secrets Manager, KMS and IAM resources are the ones rated high."
                  : "Nothing in the loaded rows matches that search or type."}
              </p>
            </div>
          ) : (
            <AdaptiveTable
              sizing="fit"
              cardsBelow={640}
              tableId="aws-resources"
              columns={columns}
              data={filtered}
              getRowId={(r) => r.id}
              enableSelection={false}
              enableExpansion={false}
              onRowClick={(r) => setSelectedId(r.id)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {connectors.length > 1 && account === ALL_ACCOUNTS ? (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3.5 flex-none" aria-hidden />
          {connectors.length} AWS accounts are connected. Resources can be narrowed to one account;
          the identities listed inside a row are already scoped to that resource&apos;s own account.
        </p>
      ) : null}

      <AWSResourceDrawer
        resource={selected}
        connector={selected ? connectorById.get(selected.connector_id) : undefined}
        onClose={() => setSelectedId(null)}
        onPrev={() => setSelectedId(filtered[selectedIndex - 1]?.id ?? null)}
        onNext={() => setSelectedId(filtered[selectedIndex + 1]?.id ?? null)}
        index={selectedIndex >= 0 ? selectedIndex : 0}
        total={filtered.length}
      />
    </div>
  );
}
