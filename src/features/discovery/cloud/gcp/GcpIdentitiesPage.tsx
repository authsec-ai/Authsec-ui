/**
 * Google Cloud identities in Discovery: service accounts, the principals named
 * only in IAM bindings (users, groups, domains, public, federated, service
 * agents, deleted principals) and the project rows that own API keys.
 *
 * Reads `GET /authsec/discovery/gcp/identities`, which is fenced server-side to
 * the workspace's Google Cloud connectors. Kind and Source filter on the server;
 * search narrows the rows loaded, and says so.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Info } from "lucide-react";

import {
  useListGcpConnectorsQuery,
  useListGcpIdentitiesQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type CloudIdentity,
} from "@/app/api/cloudDiscoveryApi";
import { type AppliedFilter } from "@/components/console/iam-console";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { TableCard } from "@/theme/components/cards";

import { InventoryToolbar } from "../InventoryToolbar";
import { AWSFilterChips } from "../aws/AWSFilterChips";
import { ALL_ACCOUNTS } from "../aws/awsInventoryLabels";
import { CandidateIdentityCaveat, InventoryEmptyState, TruncationNotice } from "../aws/AWSInventoryNotices";
import { inventoryEmptyReason, truncationOf } from "../aws/awsInventoryState";
import { GCP_IDENTITY_LABEL, GCP_KIND_FILTERS, isExternalIdentity, readableIdentityName, shortResourceId } from "./gcpInventoryLabels";
import { GcpProjectCell, CopyableId } from "./GcpInventoryCells";

function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—";
}

const KIND_KEYS = new Set(GCP_KIND_FILTERS.map((k) => k.key));

export default function GcpIdentitiesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const account = params.get("source") ?? ALL_ACCOUNTS;
  const kindParam = params.get("kind") ?? "all";
  const kind = KIND_KEYS.has(kindParam) ? kindParam : "all";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === ALL_ACCOUNTS || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const connectorsQ = useListGcpConnectorsQuery();
  const connectors = useMemo(() => connectorsQ.data ?? [], [connectorsQ.data]);
  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const q = useListGcpIdentitiesQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
    kind: kind === "all" ? undefined : kind,
    limit: AWS_DISCOVERY_MAX_LIMIT,
    offset: 0,
  });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((i) => i.name.toLowerCase().includes(s) || i.native_id.toLowerCase().includes(s));
  }, [rows, search]);

  // Drawer pager
  const selectedIndex = filtered.findIndex((i) => i.id === selectedId);

  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const clearAllFilters = () => {
    const next = new URLSearchParams(params);
    next.delete("kind");
    next.delete("source");
    setParams(next, { replace: true });
    setSearch("");
  };

  const applied: AppliedFilter[] = [];
  if (kind !== "all") {
    applied.push({ key: "kind", label: `Kind: ${GCP_KIND_FILTERS.find((k) => k.key === kind)?.label ?? kind}`, onRemove: () => setParam("kind", null) });
  }
  if (account !== ALL_ACCOUNTS) {
    applied.push({ key: "account", label: `Source: ${connectorById.get(account)?.scope_id ?? account}`, onRemove: () => setParam("source", null) });
  }

  const columns = useMemo<AdaptiveColumn<CloudIdentity>[]>(
    () => [
      {
        id: "identity",
        accessorKey: "name",
        header: "Identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 360,
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground" title={readableIdentityName(i.name, i.native_id)}>
                  {readableIdentityName(i.name, i.native_id)}
                </div>
                <CopyableId value={i.native_id} display={shortResourceId(i.native_id)} label="ID" />
              </div>
              <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {GCP_IDENTITY_LABEL[i.kind] ?? i.kind}
              </span>
            </div>
          );
        },
      },
      {
        id: "project",
        header: "Project",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => {
          const a = (row.original.attrs ?? {}) as { project_id?: string; project?: string };
          const projectId = a.project_id || a.project || connectorById.get(row.original.connector_id)?.scope_id;
          return <GcpProjectCell projectId={projectId} external={isExternalIdentity(row.original.attrs)} />;
        },
      },
      {
        id: "last_seen",
        accessorKey: "last_seen_at",
        header: "Last seen",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" title={row.original.last_seen_at ? new Date(row.original.last_seen_at).toLocaleString() : undefined}>
            {relativeOrUnknown(row.original.last_seen_at)}
          </span>
        ),
      },
      {
        id: "created",
        accessorKey: "created_at",
        header: "Created in Google Cloud",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" title={row.original.created_at ? new Date(row.original.created_at).toLocaleString() : undefined}>
            {relativeOrUnknown(row.original.created_at)}
          </span>
        ),
      },
    ],
    [connectorById],
  );

  const liveConnectors = useMemo(
    () => (account === ALL_ACCOUNTS ? connectors : connectors.filter((c) => c.id === account)),
    [connectors, account],
  );

  const emptyReason = inventoryEmptyReason(liveConnectors, "identities", "gcp");
  const loading = q.isLoading || connectorsQ.isLoading;

  return (
    <div className="space-y-4">
      {q.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load Google Cloud identities.</strong>{" "}
          {(q.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The Google Cloud discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {q.data ? <TruncationNotice truncation={truncationOf(q.data)} noun="identities" narrowBy="Narrow by Source or Kind first; both filter server-side." /> : null}

      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name, email or ID`}
        chips={<AWSFilterChips label="Identity kind" options={GCP_KIND_FILTERS} active={kind} onSelect={(key) => setParam("kind", key === "all" ? null : key)} />}
        applied={applied}
        onClearAll={() => {
          clearAllFilters();
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun="identities"
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
            <InventoryEmptyState reason={emptyReason} surface="identities" provider="gcp" />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">No identities match</p>
              <p className="mt-1 text-xs text-muted-foreground">Nothing in the loaded rows matches that search.</p>
            </div>
          ) : (
            <AdaptiveTable
              sizing="fit"
              cardsBelow={640}
              tableId="gcp-identities"
              columns={columns}
              data={filtered}
              getRowId={(i) => i.id}
              enableSelection={false}
              enableExpansion={false}
              rowDetails={false}
              onRowClick={(i) => navigate(`/iga/gcp/identity/${encodeURIComponent(i.id)}`)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <footer className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
        <CandidateIdentityCaveat />
        {connectors.length > 1 && account === ALL_ACCOUNTS ? (
          <p className="flex items-start gap-1.5">
            <Info className="mt-px size-3.5 flex-none" aria-hidden />
            {connectors.length} Google Cloud projects are connected. Narrow to one with Source; each identity's own tabs are already scoped to it.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
