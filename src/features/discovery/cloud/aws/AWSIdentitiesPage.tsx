/**
 * Discovery → AWS Identities
 *
 * The candidate IAM identity inventory: every role and user the AWS scan
 * found, with the "granted but never exercised" signal beside it.
 *
 * Why a full route and not a tab on AWSConnectorDrawer: the connector drawer is
 * 560px and answers "is this connection healthy". This answers "what is in the
 * account", needs table width, search, paging and a deep link, and is where a
 * reader spends time. The drawer keeps the connection view; this owns contents.
 *
 * Rendered by Discovery as the Latest collected view of identities, which owns
 * the page header and the type switcher — so this file begins at the body. Everything below
 * still follows the console table standard (AGENTS.md → "Console page
 * standard"): MetricStrip → ConsoleFilterBar → TableCard/flush → AdaptiveTable
 * → RightDrawer. Nothing here hand-rolls a page header.
 *
 * ── How much data this page loads, and why ──────────────────────────────────
 *
 * Every AWS discovery endpoint paginates, capping a response at 500 rows. So
 * the honest options were server-side paging with no working search (the
 * endpoint has no search parameter), or one request at the server's own
 * maximum with search and paging done client-side over what came back.
 *
 * This takes the second. `meta.total` is the real count, so when an account
 * holds more than one request returns the page SAYS so and points at the two
 * filters that are genuinely server-side (account and kind), rather than
 * quietly searching a subset and calling it the answer.
 *
 * The activity column is a second, independent read — see `usageQuery` below.
 * It truncates on its own terms and carries its own notice.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";

import { MetricStrip, type MetricStripItemDef } from "@/components/console/MetricStrip";
import { EntityCell, type AppliedFilter, type ConsoleFilterOption } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import {
  useListAwsConnectorsQuery,
  useListGcpConnectorsQuery,
  useListAwsIdentityPageQuery,
  useListAwsUsageAllQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type AWSConnectorAttrs,
  type CloudIdentity,
  type CloudIdentityKind,
} from "@/app/api/cloudDiscoveryApi";

import { InventoryToolbar } from "../InventoryToolbar";
import { AWSFilterChips } from "./AWSFilterChips";
import { ALL_ACCOUNTS, IDENTITY_KIND_LABEL, metricLabel } from "./awsInventoryLabels";
import { AWSAccountCell, CopyableId } from "./AWSInventoryCells";
import { AWSIdentityDrawer } from "./AWSIdentityDrawer";
import {
  CandidateIdentityCaveat,
  InventoryEmptyState,
  InventoryNotice,
  TruncationNotice,
} from "./AWSInventoryNotices";
import { inventoryEmptyReason, truncationOf } from "./awsInventoryState";

const KIND_FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "iam_role", label: "Roles" },
  { key: "iam_user", label: "Users" },
];

/** A date in words, or an em dash when none was reported (the column header says what it is). */
function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—";
}

/**
 * Embedded in Discovery as the Latest collected reading of identities. The
 * Source facet is Discovery's: a connection's id arrives as `?source=`. For
 * Google Cloud the page is forced to service accounts (`forcedKind`); for AWS
 * it leaves them out (`excludeKinds`), since the inventory table is shared.
 */
export default function AWSIdentitiesPage({
  forcedKind,
  excludeKinds,
}: {
  forcedKind?: CloudIdentityKind;
  excludeKinds?: CloudIdentityKind[];
} = {}) {
  const [params, setParams] = useSearchParams();
  const gcp = forcedKind === "gcp_service_account";
  const provider = gcp ? "gcp" : "aws";

  // URL-backed so an inventory view is shareable, the same way Discovery carries its own state.
  const account = params.get("source") ?? ALL_ACCOUNTS;
  const kindParam = params.get("kind");
  // gcp_service_account belongs here too. Without it the GCP metric tile wrote
  // ?kind=gcp_service_account, this reader fell through to "all", the query
  // sent no kind and the table did not change — a tile that looked like a
  // filter and was not one.
  const kind: "all" | CloudIdentityKind =
    forcedKind ??
    (kindParam === "iam_role" || kindParam === "iam_user" || kindParam === "gcp_service_account"
      ? kindParam
      : "all");

  const [search, setSearch] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);

  /** Clear every filter in ONE params write: two sequential setParam calls each
   * read the same stale `params`, so the second would revert the first. */
  const clearAllFilters = () => {
    const next = new URLSearchParams(params);
    next.delete("kind");
    next.delete("source");
    setParams(next, { replace: true });
    setUnusedOnly(false);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === ALL_ACCOUNTS || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const awsConnectorsQuery = useListAwsConnectorsQuery();
  const gcpConnectorsQuery = useListGcpConnectorsQuery(undefined, { skip: forcedKind !== "gcp_service_account" });
  const connectorsQuery = forcedKind === "gcp_service_account" ? gcpConnectorsQuery : awsConnectorsQuery;
  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data]);

  const identitiesQuery = useListAwsIdentityPageQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
    kind: kind === "all" ? undefined : kind,
    limit: AWS_DISCOVERY_MAX_LIMIT,
    offset: 0,
  });

  /**
   * Per-identity activity, for the "granted but never used" column.
   *
   * Read across pages, grouped client-side. The alternative — one
   * `?identity_id=` call per row — is an N+1 this table cannot afford, and
   * there is no grouped-count endpoint and no `never_accessed=true` filter to
   * ask for instead.
   *
   * This used to be one unpaginated read. `/aws/usage` now caps at 500 rows
   * and DEFAULTS TO 100, so the same call silently produced a map covering a
   * twelfth of the rows — every identity beyond it rendered "Not reported" and
   * the "With unused access" tile read near-zero. `listAwsUsageAll` walks the
   * pages instead, up to a hard cap, and reports when it hit that cap so the
   * column can drop its denominator rather than print a wrong one.
   *
   * Scoped to the selected account when there is one: on a single-account view
   * this is usually a single request.
   */
  const usageQuery = useListAwsUsageAllQuery({
    connector_id: account === ALL_ACCOUNTS ? undefined : account,
  });

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

  /** True when the activity read could not reach every row — the cap bit, or a
   * page failed part-way. The never-used COUNTS stay exact even then, because
   * the server sorts `last_used_at ASC NULLS FIRST` and never-accessed rows
   * land on the first page; it is the per-identity totals that go short. */
  const usageIncomplete = Boolean(
    usageQuery.data?.truncated || usageQuery.data?.partialError,
  );

  const connectorById = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  // Wrapped rather than inlined: `?? []` builds a new array identity on every
  // render, which would invalidate every useMemo below it each time.
  const rows = useMemo(
    () => (identitiesQuery.data?.rows ?? []).filter((i) => !excludeKinds?.includes(i.kind)),
    [identitiesQuery.data, excludeKinds],
  );
  // The server's total counts every kind it returned. When this reading leaves some out
  // (Google Cloud's rows on the AWS list), the total of what remains is not the server's
  // minus the ones in hand: a capped page cannot say how many it left out beyond it. So
  // with nothing left out the total is the server's; otherwise it is what loaded, and a
  // capped page says it is only that.
  const loadedAll = identitiesQuery.data?.rows.length ?? 0;
  const serverTotal = identitiesQuery.data?.total ?? 0;
  const leftOut = loadedAll - rows.length;
  const total = leftOut === 0 ? serverTotal : rows.length;
  const truncated = leftOut === 0 ? serverTotal > rows.length : serverTotal > loadedAll;

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
    // The inventory table is shared across providers, so a GCP service account
    // sits in it beside the AWS rows. Counting them into one "Identities" total
    // beside a breakdown of "IAM roles" and "IAM users" made 38 = 31 + 4 with
    // three rows unaccounted for, under a heading describing AWS.
    const gcpServiceAccounts = rows.filter((i) => i.kind === "gcp_service_account").length;
    let withUnused = 0;
    for (const i of rows) {
      const usage = usageByIdentity.get(i.id);
      if (usage && usage.never > 0) withUnused += 1;
    }
    return [
      {
        key: "total",
        // Deliberately "Identities", not "AWS identities": the number counts
        // every provider's rows, and the tiles beside it break that down.
        label: metricLabel("Identities", truncated, rows.length),
        value: total,
        tone: "primary",
        active: kind === "all" && !unusedOnly,
        title: "Show every identity",
        onClick: () => {
          setParam("kind", null);
          setUnusedOnly(false);
        },
      },
      {
        key: "roles",
        label: metricLabel("IAM roles", truncated, rows.length),
        value: roles,
        active: kind === "iam_role",
        title: "Show only IAM roles",
        onClick: () => setParam("kind", kind === "iam_role" ? null : "iam_role"),
      },
      {
        key: "users",
        label: metricLabel("IAM users", truncated, rows.length),
        value: users,
        active: kind === "iam_user",
        title: "Show only IAM users",
        onClick: () => setParam("kind", kind === "iam_user" ? null : "iam_user"),
      },
      ...(gcpServiceAccounts > 0
        ? [
            {
              key: "gcp",
              label: metricLabel("GCP service accounts", truncated, rows.length),
              value: gcpServiceAccounts,
              active: kind === "gcp_service_account",
              title: "Show only GCP service accounts",
              onClick: () => setParam("kind", kind === "gcp_service_account" ? null : "gcp_service_account"),
            } as MetricStripItemDef,
          ]
        : []),
      {
        key: "unused",
        // Qualified on the ACTIVITY read, not the identity read: this tile can
        // undercount because usage was incomplete even when every identity
        // loaded, and those are different failures with the same symptom.
        label: metricLabel("With unused access", usageIncomplete, rows.length),
        value: withUnused,
        tone: withUnused > 0 ? "warning" : "neutral",
        active: unusedOnly,
        title: unusedOnly ? "Show identities whether or not they have unused access" : "Show only identities with access they have never used",
        // Combines with a kind: "IAM roles with unused access".
        onClick: () => setUnusedOnly((v) => !v),
      },
    ];
    // setParam closes over `params`; rebuilding the strip when it changes is
    // correct and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, total, truncated, usageByIdentity, usageIncomplete, params]);

  /** Roles and Users always; GCP service accounts only once some exist, so a
   * pure-AWS workspace is not offered a filter that can only ever return
   * nothing. Pairs with the metric tile, which now filters for real. */
  const kindFilters = useMemo<ConsoleFilterOption[]>(() => {
    const base = [...KIND_FILTERS];
    if (rows.some((i) => i.kind === "gcp_service_account")) {
      base.push({ key: "gcp_service_account", label: "GCP service accounts" });
    }
    return base;
  }, [rows]);

  /** What is narrowing the list, each removable. Search is excluded — it is
   * visible in its own box, so a chip repeating it would be noise. */
  const appliedFilters = useMemo<AppliedFilter[]>(() => {
    const out: AppliedFilter[] = [];
    if (kind !== "all") {
      out.push({
        key: "kind",
        label: `Kind: ${IDENTITY_KIND_LABEL[kind] ?? kind}`,
        onRemove: () => setParam("kind", null),
      });
    }
    if (unusedOnly) {
      out.push({ key: "unused", label: "Unused access only", onRemove: () => setUnusedOnly(false) });
    }
    if (account !== ALL_ACCOUNTS) {
      const c = connectors.find((x) => x.id === account);
      out.push({
        key: "account",
        label: `Source: ${c?.scope_id ?? account}`,
        onRemove: () => setParam("source", null),
      });
    }
    return out;
    // setParam closes over `params`; rebuilding when it changes is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, unusedOnly, account, connectors, params]);

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
              detail={<CopyableId value={i.native_id} />}
              badge={
                // IDENTITY_KIND_LABEL, not a role/user ternary. The ternary
                // called a GCP service account a "User", losing exactly the
                // machine/human distinction that map exists to keep — and the
                // drawer header, which uses the map, then disagreed with the
                // table about the same identity.
                <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {IDENTITY_KIND_LABEL[i.kind] ?? i.kind}
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
          const attrs = connector?.attrs as AWSConnectorAttrs | undefined;
          return (
            <AWSAccountCell accountId={connector?.scope_id} name={attrs?.display_name?.trim()} />
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
            // "All N used" claims completeness, so it can only be said when
            // the activity read reached everything.
            return (
              <span className="text-xs text-muted-foreground">
                {usageIncomplete ? "None reported unused" : `All ${usage.total} used`}
              </span>
            );
          }
          // When the read was capped, BOTH numbers are floors.
          //
          // This used to drop only the denominator, on the reasoning that
          // never-accessed rows sort first and are therefore always in hand.
          // That fails in the two cases that matter: when an identity's
          // never-accessed rows alone exceed the cap, and when a later page
          // fails after earlier ones succeeded. An identity with 2,500 such
          // rows loaded 2,000 and rendered "2000 never used" — a precise
          // figure, and wrong. "At least" is the only honest form until
          // completeness is established.
          // A dot, not a filled pill: most roles carry some never-used access,
          // and a column of amber pills stops meaning anything.
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-(--color-text)">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--color-warning)" />
              {usageIncomplete ? (
                <>
                  <span className="text-(--color-text-muted)">at least</span> {usage.never} never used
                </>
              ) : (
                <>
                  {usage.never} <span className="text-(--color-text-muted)">of {usage.total}</span> never used
                </>
              )}
            </span>
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
        header: gcp ? "Created in Google Cloud" : "Created in AWS",
        priority: 5,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeOrUnknown(row.original.created_at)}
          </span>
        ),
      },
    ],
    [connectorById, usageByIdentity, usageQuery.isLoading, usageIncomplete, gcp],
  );

  const liveConnectors = useMemo(
    () =>
      account === ALL_ACCOUNTS
        ? connectors
        : connectors.filter((c) => c.id === account),
    [connectors, account],
  );

  const emptyReason = inventoryEmptyReason(liveConnectors, "identities", provider);
  const loading = identitiesQuery.isLoading || connectorsQuery.isLoading;

  return (
    // The page header and type switcher belong to Discovery; this is the
    // tab body. Keeps ConsolePage's own body rhythm so spacing is unchanged.
    <div className="space-y-4">
      {identitiesQuery.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the identity inventory.</strong>{" "}
          {(identitiesQuery.error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : `The ${gcp ? "Google Cloud" : "AWS"} discovery API returned an error.`}{" "}
          <button className="underline" onClick={() => void identitiesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {rows.length > 0 && !forcedKind ? <MetricStrip items={metrics} /> : null}

      {identitiesQuery.data ? (
        <TruncationNotice
          truncation={truncationOf(identitiesQuery.data)}
          noun="identities"
          narrowBy="Narrow by Source or by role/user first — both of those filter server-side."
        />
      ) : null}

      {/* A separate notice from the one above: the identity list and the
          activity read truncate independently, and conflating them would tell
          the reader to narrow a filter that does not affect the shortfall. */}
      {usageIncomplete ? (
        <InventoryNotice tone="warning" icon={<AlertTriangle />}>
          <strong className="font-medium">Service activity is partial</strong>
          {" — "}
          {usageQuery.data?.partialError
            ? "reading it failed part-way, so some identities show fewer services than they have."
            : "more activity rows exist than one read collects, so service totals are a floor."}{" "}
          Never-used counts come first and are shown as "at least".
        </InventoryNotice>
      ) : null}

      {/* The tiles above are the kind and unused-access filters; this row is
          search and the account scope. Nothing is offered twice. With no
          rows there are no tiles, so the kind chips stand in for them. */}
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name, ARN or tag`}
        chips={
          rows.length || forcedKind ? null : (
            <AWSFilterChips
              label="Identity kind"
              options={kindFilters}
              active={kind}
              onSelect={(key) => setParam("kind", key === "all" ? null : key)}
            />
          )
        }
        applied={appliedFilters}
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
          ) : identitiesQuery.isError && !rows.length ? (
            // The banner above says what failed; an empty-inventory message
            // here would claim there is nothing to find.
            <p className="px-6 py-10 text-center text-xs text-muted-foreground">
              Nothing is listed because the request failed — this is not an empty inventory.
            </p>
          ) : !rows.length ? (
            <InventoryEmptyState
              reason={emptyReason}
              surface="identities"
              provider={provider}
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
              sizing="fit"
              cardsBelow={640}
              tableId="aws-identities"
              columns={columns}
              data={filtered}
              getRowId={(i) => i.id}
              enableSelection={false}
              enableExpansion={false}
              // In fit mode enableExpansion above is ignored: the expander is driven
              // purely by whether every column fits, so it appeared and vanished with
              // the window width. Every field here is a column or is in the row's own
              // drawer, which the row click opens, so there is nothing to reveal.
              rowDetails={false}
              onRowClick={(i) => setSelectedId(i.id)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {/* What this list is, said once under it rather than above the table. */}
      <footer className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
        <CandidateIdentityCaveat />
        {connectors.length > 1 && account === ALL_ACCOUNTS ? (
          <p className="flex items-start gap-1.5">
            <Info className="mt-px size-3.5 flex-none" aria-hidden />
            {connectors.length} {gcp ? "Google Cloud projects" : "AWS accounts"} are connected. Narrow to one with Source; each
            identity's own tabs are already scoped to it.
          </p>
        ) : null}
      </footer>

      <AWSIdentityDrawer
        identity={selected}
        onClose={() => setSelectedId(null)}
        onPrev={() => setSelectedId(filtered[selectedIndex - 1]?.id ?? null)}
        onNext={() => setSelectedId(filtered[selectedIndex + 1]?.id ?? null)}
        index={selectedIndex >= 0 ? selectedIndex : 0}
        total={filtered.length}
      />
    </div>
  );
}
