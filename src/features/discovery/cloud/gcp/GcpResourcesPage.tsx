/**
 * Google Cloud resources in Discovery: the resources that carry their own IAM
 * policy (buckets, datasets, secrets, keys, topics...), each with the number of
 * bindings on it. Not an inventory of everything in a project.
 *
 * Reads `GET /authsec/discovery/gcp/resources`. Resource-level policies come from
 * Cloud Asset; when that surface was not reached, the list is empty for that
 * reason, and the notice below says to check coverage rather than read it as
 * "no resources".
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";

import {
  useListGcpConnectorsQuery,
  useListGcpResourcesQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type GcpResource,
} from "@/app/api/cloudDiscoveryApi";
import { EntityCell, type AppliedFilter } from "@/components/console/iam-console";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { TableCard } from "@/theme/components/cards";

import { CloudPill } from "../CloudPill";
import { InventoryToolbar } from "../InventoryToolbar";
import { ALL_ACCOUNTS } from "../aws/awsInventoryLabels";
import { InventoryEmptyState, InventoryNotice, TruncationNotice } from "../aws/AWSInventoryNotices";
import { inventoryEmptyReason, truncationOf } from "../aws/awsInventoryState";
import { GCP_RESOURCE_LABEL, SENSITIVITY_LABEL, readableIdentityName, shortResourceId } from "./gcpInventoryLabels";
import { GcpProjectCell, CopyableId } from "./GcpInventoryCells";

export default function GcpResourcesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const account = params.get("source") ?? ALL_ACCOUNTS;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const connectorsQ = useListGcpConnectorsQuery();
  const connectors = useMemo(() => connectorsQ.data ?? [], [connectorsQ.data]);
  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const q = useListGcpResourcesQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
    limit: AWS_DISCOVERY_MAX_LIMIT,
    offset: 0,
  });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const total = q.data?.total ?? 0;
  const truncated = q.data ? truncationOf(q.data).truncated : false;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s) || r.native_id.toLowerCase().includes(s) || r.kind.toLowerCase().includes(s));
  }, [rows, search]);

  // Drawer pager
  const selectedIndex = filtered.findIndex((r) => r.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const clearAllFilters = () => {
    const next = new URLSearchParams(params);
    next.delete("source");
    setParams(next, { replace: true });
    setSearch("");
  };

  // Was resource-level IAM actually read? A connector whose resource_iam surface
  // was not reached has an empty list for that reason, not because nothing exists.
  const inScope = account === ALL_ACCOUNTS ? connectors : connectors.filter((c) => c.id === account);
  const unread = inScope.filter((c) => c.status !== "revoked" && c.coverage?.surfaces?.resource_iam && c.coverage.surfaces.resource_iam.state !== "reached");

  const applied: AppliedFilter[] = [];
  if (account !== ALL_ACCOUNTS) {
    applied.push({
      key: "account",
      label: `Source: ${connectorById.get(account)?.scope_id ?? account}`,
      onRemove: () => {
        const next = new URLSearchParams(params);
        next.delete("source");
        setParams(next, { replace: true });
      },
    });
  }

  const columns = useMemo<AdaptiveColumn<GcpResource>[]>(
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
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground" title={readableIdentityName(r.name, r.native_id)}>
                  {readableIdentityName(r.name, r.native_id)}
                </div>
                <CopyableId value={r.native_id} display={shortResourceId(r.native_id)} label="Name" />
              </div>
              <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {GCP_RESOURCE_LABEL[r.kind] ?? r.kind}
              </span>
            </div>
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
          const why = row.original.sensitivity_reason
            ? `${row.original.sensitivity_reason} (source: ${row.original.sensitivity_source || "unknown"})`
            : undefined;
          return s === "low" ? (
            <CloudPill tone="muted" dot={false} title={why}>
              {SENSITIVITY_LABEL[s]}
            </CloudPill>
          ) : (
            <CloudPill tone="muted" dot={false} title={why}>
              {SENSITIVITY_LABEL[s]}
            </CloudPill>
          );
        },
      },
      {
        id: "bindings",
        header: "Bindings",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => <span className="text-xs">{row.original.binding_count}</span>,
      },
      {
        id: "project",
        header: "Project",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => {
          const projectId = row.original.resource_account || connectorById.get(row.original.connector_id)?.scope_id;
          return <GcpProjectCell projectId={projectId} external={row.original.is_external} />;
        },
      },
    ],
    [connectorById],
  );

  const liveConnectors = useMemo(
    () => (account === ALL_ACCOUNTS ? connectors : connectors.filter((c) => c.id === account)),
    [connectors, account],
  );

  const emptyReason = inventoryEmptyReason(liveConnectors, "resources", "gcp");
  const loading = q.isLoading || connectorsQ.isLoading;

  return (
    <div className="space-y-4">
      {q.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load Google Cloud resources.</strong>{" "}
          {(q.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The Google Cloud discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {unread.length ? (
        <InventoryNotice tone="warning" icon={<Info />}>
          <strong className="font-medium">Resource-level IAM was not read</strong>
          {" for "}
          {unread.map((c) => c.scope_id).join(", ")}
          {". "}
          The last scan did not reach it, so buckets, datasets and secrets with their own policy are not listed. This is not evidence that none exist.
          {unread[0].coverage?.surfaces?.resource_iam?.error ? ` Reason: ${unread[0].coverage?.surfaces?.resource_iam?.error}` : ""}
        </InventoryNotice>
      ) : null}

      {q.data ? <TruncationNotice truncation={truncationOf(q.data)} noun="resources" narrowBy="Narrow by Source first; it filters server-side." /> : null}

      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name or resource type`}
        applied={applied}
        onClearAll={() => {
          clearAllFilters();
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun="resources"
      />

      <TableCard>
        <CardContent variant="flush">
          {loading ? (
            <div className="p-4">
              <DataTableSkeleton columns={5} rows={6} showSelection={false} showActions={false} />
            </div>
          ) : q.isError && !rows.length ? (
            <p className="px-6 py-10 text-center text-xs text-muted-foreground">
              Nothing is listed because the request failed — this is not an empty inventory.
            </p>
          ) : !rows.length ? (
            <InventoryEmptyState reason={emptyReason} surface="resources" provider="gcp" />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">No resources match</p>
              <p className="mt-1 text-xs text-muted-foreground">Nothing in the loaded rows matches that search.</p>
            </div>
          ) : (
            <AdaptiveTable
              sizing="fit"
              cardsBelow={640}
              tableId="gcp-resources"
              columns={columns}
              data={filtered}
              getRowId={(r) => r.id}
              enableSelection={false}
              enableExpansion={false}
              rowDetails={false}
              onRowClick={(r) => navigate(`/iga/gcp/resource/${encodeURIComponent(r.id)}`)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <footer className="text-[11px] leading-relaxed text-muted-foreground">
        <p>A resource is listed because it has its own IAM policy. Access granted on its project, folder or organization reaches it too, and is shown on the identity's Access tab.</p>
      </footer>

      {connectors.length > 1 && account === ALL_ACCOUNTS ? (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3.5 flex-none" aria-hidden />
          {connectors.length} Google Cloud projects are connected. Resources can be narrowed to one project with Source.
        </p>
      ) : null}
    </div>
  );
}
