/**
 * AgentCore workload identities.
 *
 * ── Why these have nowhere else to live ─────────────────────────────────────
 *
 * A workload identity is AgentCore's own principal. It is not an IAM role, not
 * a permission, not a resource, and not compute — so there is no inventory row
 * to hang it off, and the backend says so in the collector itself: "No
 * ObservationSubject constructor fits". Every one of these rows arrives with
 * ALL FOUR subject columns null, which the observations endpoint's own
 * `meta.note` calls out as expected rather than an error.
 *
 * That is why this is a sibling view on the Compute page rather than a tab in
 * some identity's drawer: there is no identity it belongs to.
 *
 * ── What this list is, and is not ───────────────────────────────────────────
 *
 * It is evidence, not inventory. These rows are not reconciled against a
 * generation the way `cloud_workload` is, so a name here means "AgentCore
 * reported this at the last scan that read the surface", not "this exists
 * now". The confirmation count is the honest freshness signal.
 */

import { useMemo, useState } from "react";

import { ConsoleFilterBar } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { Fingerprint } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  useListAwsConnectorsQuery,
  useListAwsObservationsQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type CloudObservation,
} from "@/app/api/cloudDiscoveryApi";
import { InventoryEmptyState, TruncationNotice } from "./AWSInventoryNotices";
import { inventoryEmptyReason, truncationOf } from "./awsInventoryState";
import {
  SOURCE_AGENTCORE_WORKLOAD_IDENTITIES,
  workloadIdentityFacts,
} from "./awsObservationFacts";

function relative(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

export function AWSWorkloadIdentitiesView() {
  const [search, setSearch] = useState("");

  const connectorsQuery = useListAwsConnectorsQuery();
  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data]);

  // No subject filter — every row here is subject-less by design, so filtering
  // by one would return nothing.
  const identitiesQuery = useListAwsObservationsQuery({
    source_api: SOURCE_AGENTCORE_WORKLOAD_IDENTITIES,
    limit: AWS_DISCOVERY_MAX_LIMIT,
    offset: 0,
  });

  /**
   * One row per workload identity, newest observation only.
   *
   * `content_hash` is part of the dedupe key, so a renamed identity writes a
   * NEW observation and the previous one survives — evidence is durable and
   * never reconciled away. Listing every row would show the same principal
   * twice under its old and new name and call both current.
   *
   * Rows arrive `observed_at DESC`, so the first seen per ARN is current.
   */
  const rows = useMemo(() => {
    const newest = new Map<string, CloudObservation>();
    for (const o of identitiesQuery.data?.rows ?? []) {
      const key = workloadIdentityFacts(o).arn ?? o.subject_native_id ?? o.id;
      if (!newest.has(key)) newest.set(key, o);
    }
    return [...newest.values()];
  }, [identitiesQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((o) => {
      const f = workloadIdentityFacts(o);
      return (
        (f.name ?? "").toLowerCase().includes(q) || (f.arn ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const columns = useMemo<AdaptiveColumn<CloudObservation>[]>(
    () => [
      {
        id: "identity",
        header: "Workload identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => {
          const f = workloadIdentityFacts(row.original);
          return (
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {f.name || f.arn || row.original.subject_native_id}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground" title={f.arn}>
                {f.arn}
              </p>
            </div>
          );
        },
      },
      {
        id: "observed",
        accessorKey: "observed_at",
        header: "Observed",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground"
            title={new Date(row.original.observed_at).toLocaleString()}
          >
            {relative(row.original.observed_at)}
          </span>
        ),
      },
      {
        // The freshness signal that replaces a reconciled last_seen: an
        // unchanged re-read bumps this instead of writing a duplicate row.
        id: "confirmed",
        header: "Last confirmed",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => {
          const o = row.original;
          return (
            <span className="text-xs text-muted-foreground">
              {o.last_confirmed_at ? relative(o.last_confirmed_at) : "Not re-confirmed"}
              {o.confirmation_count > 1 ? (
                <span className="ml-1 tabular-nums">· seen {o.confirmation_count}×</span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [],
  );

  const emptyReason = inventoryEmptyReason(connectors, "workload_identities");
  const loading = identitiesQuery.isLoading || connectorsQuery.isLoading;
  const failed = identitiesQuery.isError;

  return (
    <div className="space-y-4">
      {identitiesQuery.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load workload identities.</strong>{" "}
          {(identitiesQuery.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The AWS discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void identitiesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {identitiesQuery.data ? (
        <TruncationNotice
          truncation={truncationOf(identitiesQuery.data)}
          noun="workload identities"
          // No server-side filter exists for this surface beyond source_api,
          // which is already applied, so there is nothing honest to point at.
        />
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        AgentCore's own principals — not IAM roles, and not attached to any identity, resource or
        compute row, which is why they are listed separately. Recorded as evidence, so a name here
        means the last scan that read this surface saw it, not that it exists right now.
      </p>

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or ARN…"
      />

      <TableCard>
        <CardContent variant="flush">
          {loading ? (
            <div className="p-4">
              <DataTableSkeleton columns={3} rows={5} showSelection={false} showActions={false} />
            </div>
          ) : failed ? (
            // Nothing at all under a failed read. The error banner above says
            // what happened; rendering an empty state beside it would explain
            // an absence the request never established.
            null
          ) : !rows.length ? (
            <InventoryEmptyState reason={emptyReason} surface="workload_identities" />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto mb-2.5 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Fingerprint className="size-5" />
              </span>
              <p className="text-sm font-semibold text-foreground">No workload identities match</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Nothing in the loaded rows matches that search.
              </p>
            </div>
          ) : (
            <AdaptiveTable
              tableId="aws-workload-identities"
              columns={columns}
              data={filtered}
              getRowId={(o) => o.id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
