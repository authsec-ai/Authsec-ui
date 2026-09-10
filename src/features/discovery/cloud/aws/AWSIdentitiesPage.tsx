/**
 * Discovery → AWS Identities
 *
 * The candidate IAM identity inventory: every role and user the AWS scan
 * found, with the "granted but never exercised" signal beside it.
 *
 * Why a page and not more tabs on AWSConnectorDrawer: the connector drawer is
 * 560px and answers "is this connection healthy". This answers "what is in the
 * account", needs table width, search, paging and a deep link, and is where a
 * reader spends time. The drawer keeps the connection view; this owns contents.
 *
 * Follows the console table standard exactly (AGENTS.md → "Console page
 * standard"): ConsolePage → MetricStrip → ConsoleFilterBar → TableCard/flush →
 * AdaptiveTable → RightDrawer. Nothing here hand-rolls a page header.
 *
 * ── How much data this page loads, and why ──────────────────────────────────
 *
 * `GET /aws/identities` is the ONE AWS discovery endpoint that paginates. It
 * takes limit/offset and reports a true `total`. So the honest options were
 * server-side paging with no working search (the endpoint has no search
 * parameter), or one request at the server's own maximum with search and
 * paging done client-side over what came back.
 *
 * This takes the second. `limit` is the server's clamp of 500; `meta.total` is
 * the real count, so when an account holds more than that the page SAYS so and
 * points at the two filters that are genuinely server-side (account and kind),
 * rather than quietly searching a subset and calling it the answer.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";

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
import {
  useListAwsConnectorsQuery,
  useListAwsIdentityPageQuery,
  useListAwsUsageQuery,
  useScanAwsConnectorMutation,
  type CloudIdentity,
  type CloudIdentityKind,
} from "@/app/api/cloudDiscoveryApi";
import { toast } from "react-hot-toast";

import { AWSAccountPicker } from "./AWSAccountPicker";
import { ALL_ACCOUNTS } from "./awsInventoryLabels";
import { AWSIdentityDrawer } from "./AWSIdentityDrawer";
import {
  CandidateIdentityCaveat,
  InventoryEmptyState,
  InventoryNotice,
} from "./AWSInventoryNotices";
import { inventoryEmptyReason } from "./awsInventoryState";
import { awsErrorCopy } from "./awsErrorCopy";

/** The server's own clamp (`limit <= 0 || limit > 500 → 100`). Asking for more
 * silently gets 100 back, which would look like a much smaller account. */
const SERVER_MAX_LIMIT = 500;

const KIND_FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "iam_role", label: "Roles" },
  { key: "iam_user", label: "Users" },
];

function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

export default function AWSIdentitiesPage() {
  const [params, setParams] = useSearchParams();

  // URL-backed so an inventory view is shareable, the same way
  // DiscoveryIntegrationsPage carries its own state.
  const account = params.get("account") ?? ALL_ACCOUNTS;
  const kindParam = params.get("kind");
  const kind: "all" | CloudIdentityKind =
    kindParam === "iam_role" || kindParam === "iam_user" ? kindParam : "all";

  const [search, setSearch] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === ALL_ACCOUNTS || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const connectorsQuery = useListAwsConnectorsQuery();
  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data]);

  const identitiesQuery = useListAwsIdentityPageQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
    kind: kind === "all" ? undefined : kind,
    limit: SERVER_MAX_LIMIT,
    offset: 0,
  });

  /**
   * Per-identity activity, for the "granted but never used" column.
   *
   * One unfiltered read, grouped client-side. The alternative — one
   * `?identity_id=` call per row — is an N+1 this table cannot afford, and
   * there is no grouped-count endpoint and no `never_accessed=true` filter to
   * ask for instead.
   *
   * THIS DEPENDS ON `/aws/usage` BEING UNPAGINATED, which it is today (no
   * limit/offset server-side, `meta.count` is the response's own length). If
   * that endpoint ever gains paging without also gaining a per-identity
   * grouped count, this column would start reporting the first page's answer
   * for every row — so it must be revisited together with that change, not
   * after it.
   */
  const usageQuery = useListAwsUsageQuery();

  const usageByIdentity = useMemo(() => {
    const map = new Map<string, { total: number; never: number }>();
    for (const u of usageQuery.data?.rows ?? []) {
      const entry = map.get(u.identity_id) ?? { total: 0, never: 0 };
      entry.total += 1;
      if (!u.last_used_at) entry.never += 1;
      map.set(u.identity_id, entry);
    }
    return map;
  }, [usageQuery.data]);

  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  // Wrapped rather than inlined: `?? []` builds a new array identity on every
  // render, which would invalidate every useMemo below it each time.
  const rows = useMemo(() => identitiesQuery.data?.rows ?? [], [identitiesQuery.data]);
  const total = identitiesQuery.data?.total ?? 0;
  const truncated = total > rows.length;

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
    return rows.filter((i) => {
      if (unusedOnly) {
        const usage = usageByIdentity.get(i.id);
        if (!usage || usage.never === 0) return false;
      }
      if (!q) return true;
      const attrs = i.attrs as { tags?: Record<string, string> };
      return (
        i.name.toLowerCase().includes(q) ||
        i.native_id.toLowerCase().includes(q) ||
        Object.entries(attrs?.tags ?? {}).some(
          ([k, v]) => k.toLowerCase().includes(q) || (v ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [rows, search, unusedOnly, usageByIdentity]);

  // The drawer's pager steps through what the reader can actually see.
  const selectedIndex = filtered.findIndex((i) => i.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  // A row that scrolls out of the filtered set (search narrowed, filter
  // changed) must not leave a drawer open on something no longer listed.
  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const metrics = useMemo<MetricStripItemDef[]>(() => {
    const roles = rows.filter((i) => i.kind === "iam_role").length;
    const users = rows.filter((i) => i.kind === "iam_user").length;
    let withUnused = 0;
    for (const i of rows) {
      const usage = usageByIdentity.get(i.id);
      if (usage && usage.never > 0) withUnused += 1;
    }
    return [
      {
        key: "total",
        label: total === rows.length ? "Identities" : `Identities (showing ${rows.length})`,
        value: total,
        tone: "primary",
        onClick: () => {
          setParam("kind", null);
          setUnusedOnly(false);
        },
      },
      { key: "roles", label: "IAM roles", value: roles, onClick: () => setParam("kind", "iam_role") },
      { key: "users", label: "IAM users", value: users, onClick: () => setParam("kind", "iam_user") },
      {
        key: "unused",
        label: "With unused access",
        value: withUnused,
        tone: withUnused > 0 ? "warning" : "neutral",
        onClick: () => setUnusedOnly(true),
      },
    ];
    // setParam closes over `params`; rebuilding the strip when it changes is
    // correct and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, total, usageByIdentity, params]);

  const columns = useMemo<AdaptiveColumn<CloudIdentity>[]>(
    () => [
      {
        id: "identity",
        accessorKey: "name",
        header: "Identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 300,
        cell: ({ row }) => {
          const i = row.original;
          return (
            <EntityCell
              label={i.name || i.native_id}
              detail={i.native_id}
              monoDetail
              badge={
                <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  {i.kind === "iam_role" ? "Role" : "User"}
                </span>
              }
            />
          );
        },
      },
      {
        id: "account",
        header: "Account",
        priority: 4,
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
        id: "activity",
        header: "Service activity",
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => {
          const usage = usageByIdentity.get(row.original.id);
          // No usage rows at all is NOT "never used anything": a service AWS
          // could not read produces no row, and the activity scanner reports
          // no status of its own. Say "not reported", never "unused".
          if (usageQuery.isLoading) {
            return <span className="text-xs text-muted-foreground">…</span>;
          }
          if (!usage) {
            return <span className="text-xs text-muted-foreground">Not reported</span>;
          }
          if (usage.never === 0) {
            return (
              <span className="text-xs text-muted-foreground">
                All {usage.total} used
              </span>
            );
          }
          return (
            <StatusBadge tone="warning" dot={false}>
              {usage.never} of {usage.total} never used
            </StatusBadge>
          );
        },
      },
      {
        id: "last_used",
        accessorKey: "last_used_at",
        header: "Last used",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground"
            title={row.original.last_used_at ? new Date(row.original.last_used_at).toLocaleString() : undefined}
          >
            {relativeOrUnknown(row.original.last_used_at)}
          </span>
        ),
      },
      {
        id: "created",
        accessorKey: "created_at",
        header: "Created in AWS",
        priority: 5,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeOrUnknown(row.original.created_at)}
          </span>
        ),
      },
    ],
    [connectorById, usageByIdentity, usageQuery.isLoading],
  );

  const liveConnectors = useMemo(
    () =>
      account === ALL_ACCOUNTS
        ? connectors
        : connectors.filter((c) => c.id === account),
    [connectors, account],
  );

  const emptyReason = inventoryEmptyReason(liveConnectors, "identities");
  const loading = identitiesQuery.isLoading || connectorsQuery.isLoading;

  return (
    <ConsolePage
      title="AWS Identities"
      description="IAM roles and users discovered in your connected AWS accounts, with what each one is permitted to do and what it has actually used."
    >
      {identitiesQuery.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the identity inventory.</strong>{" "}
          {(identitiesQuery.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The AWS discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void identitiesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? <MetricStrip items={metrics} /> : null}

      {truncated ? (
        <InventoryNotice tone="warning" icon={<AlertTriangle />}>
          <strong className="font-medium">
            Showing the first {rows.length} of {total} identities.
          </strong>{" "}
          This account holds more than one request can return, so search and the unused-access
          filter below apply to the loaded rows only. Narrow by account or by role/user first — both
          of those filter server-side.
        </InventoryNotice>
      ) : null}

      <CandidateIdentityCaveat />

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, ARN or tag…"
        filters={KIND_FILTERS}
        activeFilter={kind}
        onFilterChange={(v) => setParam("kind", v === "all" ? null : v)}
        trailing={
          <>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
              <input
                id="aws-identities-unused-only"
                type="checkbox"
                checked={unusedOnly}
                onChange={(e) => setUnusedOnly(e.target.checked)}
                className="size-3.5 accent-(--color-primary)"
              />
              Unused access only
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
          ) : !rows.length ? (
            <InventoryEmptyState
              reason={emptyReason}
              surface="identities"
              onScan={(id) => void handleScan(id)}
              scanning={scanning}
            />
          ) : !filtered.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">No identities match</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unusedOnly
                  ? "No loaded identity has a service it is permitted to use and never has."
                  : "Nothing in the loaded rows matches that search."}
              </p>
            </div>
          ) : (
            <AdaptiveTable
              tableId="aws-identities"
              columns={columns}
              data={filtered}
              getRowId={(i) => i.id}
              enableSelection={false}
              enableExpansion={false}
              onRowClick={(i) => setSelectedId(i.id)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {connectors.length > 1 && account === ALL_ACCOUNTS ? (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3.5 flex-none" aria-hidden />
          {connectors.length} AWS accounts are connected. Identities can be narrowed to one account;
          the per-identity tabs inside a row are already scoped to that identity.
        </p>
      ) : null}

      <AWSIdentityDrawer
        identity={selected}
        onClose={() => setSelectedId(null)}
        onPrev={() => setSelectedId(filtered[selectedIndex - 1]?.id ?? null)}
        onNext={() => setSelectedId(filtered[selectedIndex + 1]?.id ?? null)}
        index={selectedIndex >= 0 ? selectedIndex : 0}
        total={filtered.length}
      />
    </ConsolePage>
  );
}
