/**
 * Sightings: discovered agents (GitHub repository scans and Kubernetes
 * admission webhooks) — READ-ONLY. No claim, provision, quarantine, release or
 * delete is offered, and no enforcement status is shown (SPEC-console-revamp.md
 * *Sightings actions*; the capability remains in the backend, untouched).
 *
 * Status, Live only and Source are the server's filters and its `total` is
 * exact. The server has no `q` and no sort for this list, so the search box and
 * the sort control act on the page LOADED and say so. Paging is by offset,
 * kept in history state.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GitBranch } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  SOURCE_LABELS,
  STATUS_LABELS,
  evidenceModeOf,
  useListDiscoveredAgentsQuery,
  type DiscoveredAgent,
  type DiscoveredAgentStatus,
  type RuntimeStatus,
} from "@/app/api/discoveryApi";
import type { Connection } from "@/app/api/connectionsApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { TableCard } from "@/theme/components/cards";

import { SortSelect } from "../shared/components/FacetSelect";
import { PreviewLayout, type PreviewModel } from "../shared/components/ObjectPreview";
import { Timestamp } from "../shared/components/Timestamp";
import type { PagedView } from "../shared/listView";
import { resolvePagedView } from "../shared/listView";
import { usePaging, useRestoreScroll } from "../shared/paging";
import { DiscoveryTable, RowName } from "./DiscoveryTable";
import { nonDefaultBranch, SIGHTING_SOURCE } from "./model";
import { useClientsLookup } from "./useClientsLookup";
import type { FacetSpec } from "./FacetBar";
import { EmptyList, FilteredEmpty, UnknownSource } from "./ListStates";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenProps } from "./screenTypes";
import { SightingEvidence, SightingRuntime, SightingStatus } from "./SightingParts";

const MUTED = "text-(--color-text-muted)";
const PAGE = 50;
/** `Connection.scope_summary` for a GitHub organisation with nothing selected: "no repositories", "0 repositories". */
const NO_REPOSITORIES = /^\s*(no|0)\b/i;

const STATUSES: DiscoveredAgentStatus[] = ["unregistered", "registered", "quarantined", "ignored"];
const SORTS = [
  { value: "last_seen", label: "Last seen (loaded rows)" },
  { value: "name", label: "Name A–Z (loaded rows)" },
] as const;

// Gone last, so a destroyed agent never sits at the top of the list.
const RUNTIME_RANK: Record<RuntimeStatus, number> = { running: 0, unknown: 1, stopped: 2, gone: 3 };

/**
 * What an empty GitHub list may say. "Scanned" is claimed only for connections
 * whose discovery result exists; a connection with no repositories selected or no
 * finished scan says that instead — an empty list is not a finding then.
 */
function githubEmptyDetail(connections: Connection[]): ReactNode {
  const scanned = connections.filter((c) => c.discovery.ready);
  const noneSelected = connections.filter((c) => NO_REPOSITORIES.test(c.scope_summary));
  const unscanned = connections.length - scanned.length;
  if (noneSelected.length && noneSelected.length === connections.length) {
    return "No repositories are selected for scanning, so nothing has been scanned. Choose repositories on the connection.";
  }
  if (!scanned.length) {
    return "No scan has finished yet, so nothing is known about these repositories. This is not a finding that they hold no agents.";
  }
  return (
    <>
      The repositories in scope were scanned, and no agents were found. This is the result of the scan, not a failure.
      {unscanned > 0 ? ` ${unscanned} of ${connections.length} ${connections.length === 1 ? "connection has" : "connections have"} not finished a scan, so ${unscanned === 1 ? "it is" : "they are"} not covered by this.` : ""}
    </>
  );
}

export default function SightingsScreen(p: ScreenProps) {
  const navigate = useNavigate();
  const provider = p.provider === "github" ? "github" : "k8s";
  const paging = usePaging("discovery-sightings", 0);
  const status = (STATUSES as string[]).includes(p.url.get("status") ?? "") ? (p.url.get("status") as DiscoveredAgentStatus) : undefined;
  const live = !!p.url.get("live");
  const sort = p.url.sort === "name" ? "name" : "last_seen";
  const blocked = p.scope.kind === "unknown";
  const offset = Number(paging.cursor ?? 0) || 0;

  const q = useListDiscoveredAgentsQuery(
    {
      source: SIGHTING_SOURCE[provider],
      status,
      live: live || undefined,
      limit: PAGE,
      offset,
      // The connection id is the discovery source id for Kubernetes and GitHub.
      ...(p.scope.kind === "one" ? { discovery_source_id: p.scope.source.id } : {}),
    },
    { skip: blocked },
  );

  const needle = p.url.searchText.trim().toLowerCase();
  const loaded = q.currentData?.agents;
  const matches = (a: DiscoveredAgent) => !needle || [a.display_name, a.fingerprint, SOURCE_LABELS[a.source]].join(" ").toLowerCase().includes(needle);
  const rows = useMemo(() => {
    if (!loaded) return undefined;
    return [...loaded].sort((a, b) =>
      sort === "name"
        ? (a.display_name || "").localeCompare(b.display_name || "")
        : RUNTIME_RANK[a.runtime_status] - RUNTIME_RANK[b.runtime_status] || new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    );
  }, [loaded, sort]);

  const total = q.currentData?.total;
  const view: PagedView<DiscoveredAgent, { next_cursor: string | null; limit: number; total_known: boolean; total?: number }> = (() => {
    const adapted = {
      currentData: rows && total !== undefined ? { data: rows, meta: { next_cursor: offset + PAGE < total ? String(offset + PAGE) : null, limit: PAGE, total_known: true, total } } : undefined,
      error: q.error,
      isFetching: q.isFetching,
    };
    return resolvePagedView(adapted, paging.pageIndex);
  })();
  useRestoreScroll("discovery-sightings", view.kind === "rows");

  const clients = useClientsLookup();
  const selectedId = p.url.sel;
  const selected = selectedId ? (rows ?? []).filter(matches).find((a) => a.id === selectedId) : undefined;
  const dropSelection = view.kind === "rows" && !view.dim && !view.footerFailure && !!selectedId && !selected;
  const { select } = p.url;
  useEffect(() => {
    if (dropSelection) select(null);
  }, [dropSelection, select]);

  const sourceLabel = (a: DiscoveredAgent) => p.sources.find((s) => s.id === a.discovery_source_id)?.label ?? SOURCE_LABELS[a.source];

  const columns = useMemo<AdaptiveColumn<DiscoveredAgent>[]>(
    () => [
      {
        id: "agent",
        header: "Sighting",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => {
          const branch = nonDefaultBranch(row.original);
          return (
            <RowName
              to={`/iga/sightings/${row.original.id}`}
              name={row.original.display_name || "Unnamed"}
              rowKey={row.original.id}
              selected={selectedId === row.original.id}
              context={[SOURCE_LABELS[row.original.source]]}
              account={sourceLabel(row.original)}
              badge={
                branch ? (
                  <span className="inline-flex items-center gap-1 rounded bg-(--color-surface-subtle) px-1.5 py-0.5 text-[10.5px] text-(--color-text-muted)">
                    <GitBranch className="size-2.5" aria-hidden="true" />
                    {branch}
                  </span>
                ) : null
              }
            />
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 190,
        cardSummary: true,
        // Two badges, two axes: what was decided, and what was observed.
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <SightingStatus status={row.original.status} />
            <SightingRuntime runtime={row.original.runtime_status} />
          </div>
        ),
      },
      { id: "evidence", header: "Evidence", priority: 2, approxWidth: 150, cell: ({ row }) => <SightingEvidence agent={row.original} /> },
      { id: "account", header: "Source", priority: 3, approxWidth: 150, cell: ({ row }) => <span className="truncate text-sm">{sourceLabel(row.original)}</span> },
      {
        id: "matched",
        header: "Matched identity",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => {
          const id = row.original.matched_client_id;
          if (!id) return <span className={`text-xs ${MUTED}`}>Unmatched</span>;
          const name = clients.nameOf(id);
          return name ? <span className="block max-w-[150px] truncate text-xs" title={name}>{name}</span> : <span className={`text-xs ${MUTED}`}>Matched, name not available</span>;
        },
      },
      {
        id: "last_seen_at",
        header: "Last seen",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => {
          // For a declared finding this means "the file was still there", not "the agent was still running".
          const declared = evidenceModeOf(row.original) === "declared";
          return (
            <div className="text-xs">
              <p className={MUTED}>
                <Timestamp iso={row.original.last_seen_at} />
              </p>
              <p className={`text-[11px] ${MUTED}`}>
                {declared
                  ? `still declared · ${row.original.sighting_count} scan${row.original.sighting_count === 1 ? "" : "s"}`
                  : `${row.original.sighting_count} sighting${row.original.sighting_count === 1 ? "" : "s"}`}
              </p>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 64,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ConsoleRowActions
              items={[
                { label: "Preview", onSelect: () => p.url.select(row.original.id) },
                { label: "Open details", onSelect: () => navigate(`/iga/sightings/${row.original.id}`) },
              ]}
            />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, clients, p.sources, navigate],
  );
  const prefs = useColumnPreferences("discovery-sightings", columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();

  const specs: FacetSpec[] = [
    {
      key: "source",
      label: "Source",
      kind: "choice",
      value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
      anyLabel: provider === "github" ? "Every organisation" : "Every cluster",
      options: p.sources.map((s) => ({ value: s.id, label: s.revoked ? `${s.label} (revoked)` : s.label })),
      onChange: (v) => p.url.patch({ source: v }),
    },
    {
      key: "status",
      label: "Status",
      kind: "choice",
      value: status,
      anyLabel: "Any status",
      note: "What a person decided. It is separate from whether the agent is running.",
      options: STATUSES.map((s) => ({ value: s, label: s === "unregistered" ? "Decision needed (unregistered)" : STATUS_LABELS[s] })),
      onChange: (v) => p.url.patch({ status: v }),
    },
    { key: "live", label: "Live only", kind: "toggle", value: live ? "1" : undefined, onChange: (v) => p.url.patch({ live: v }) },
  ];

  const preview = (a: DiscoveredAgent): PreviewModel => ({
    key: a.id,
    name: a.display_name || "Unnamed sighting",
    kindLabel: `Agent sighting · ${SOURCE_LABELS[a.source]}`,
    provider,
    context: [sourceLabel(a), evidenceModeOf(a) === "declared" ? "Declared in code — it may never have run" : "Observed running"],
    facts: [
      { label: "Status", value: <span className="inline-flex flex-wrap gap-1.5"><SightingStatus status={a.status} /><SightingRuntime runtime={a.runtime_status} /></span> },
      { label: "Matched identity", value: a.matched_client_id ? clients.nameOf(a.matched_client_id) ?? "Matched, name not available" : "Unmatched" },
    ],
    exception: a.runtime_status === "gone" ? `No longer present${a.runtime_reason ? ` — ${a.runtime_reason}` : ""}. Kept as evidence it existed.` : undefined,
    detailsHref: `/iga/sightings/${a.id}`,
  });

  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider={p.provider} onClear={() => p.url.patch({ source: null })} />;

  const inScope = p.scope.kind === "one" ? [p.scope.source.connection] : p.sources.map((s) => s.connection);
  const narrowing = [needle && `search "${p.url.searchText.trim()}" (in the loaded rows)`, p.scope.kind === "one" && `source ${p.scope.source.label}`, status && `status ${STATUS_LABELS[status].toLowerCase()}`, live && "live only"].filter(Boolean) as string[];

  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={rows ? `Search the ${rows.length} loaded sightings by name, fingerprint or source` : "Search the loaded sightings by name, fingerprint or source"}
      searchHint="Sightings have no server search: this narrows the sightings loaded on this page, and does not look further."
      facets={specs}
      trailing={
        <>
          <SortSelect value={sort} options={[...SORTS]} onChange={(v) => p.url.patch({ sort: v === "last_seen" ? null : v })} />
          <ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={layout} />
        </>
      }
      onClearAll={() => p.url.patch({ status: null, live: null, source: null })}
    >
      {(width) => (
        <PreviewLayout
          width={width}
          model={selected ? preview(selected) : null}
          onClose={() => p.url.select(null)}
          list={
            <TableCard>
              <CardContent variant="flush">
                <DiscoveryTable<DiscoveredAgent>
                  tableId="discovery-sightings"
                  view={view}
                  columns={columns}
                  getRowId={(a) => a.id}
                  selectedId={selectedId}
                  onSelect={(a) => p.url.select(a.id)}
                  pageIndex={paging.pageIndex}
                  onPrev={paging.prev}
                  onNext={paging.next}
                  onRetry={() => void q.refetch()}
                  subject="sightings"
                  permission="discovery:read"
                  chosenColumns={prefs.chosen}
                  onColumnsLayout={setLayout}
                  rowFilter={needle ? matches : undefined}
                  filterNote={(shown, loadedCount) => `Search matches ${shown} of the ${loadedCount} loaded rows. The server has no search for sightings, so it cannot look further.`}
                  empty={
                    narrowing.length ? (
                      <FilteredEmpty
                        subject="sightings"
                        narrowing={narrowing}
                        onClear={() => {
                          p.url.setSearchText("");
                          p.url.patch({ status: null, live: null, source: null });
                        }}
                      />
                    ) : (
                      <EmptyList subject="sightings" detail={provider === "github" ? githubEmptyDetail(inScope) : "No agents have been sighted in the clusters that report here."} />
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
