/**
 * Discovery → Discovered Agents
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). The quarantine-first
 * inventory: an agent is sighted, matched against known identities, and if
 * unmatched surfaced for a decision — provision or quarantine.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  type ConsoleActionItem,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerBody,
  DrawerHeader,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
} from "@/components/console/detail";
import {
  ARCHETYPE_LABELS,
  ORIGIN_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  useGetAgentCoverageQuery,
  useListDiscoveredAgentsQuery,
  type DiscoveredAgent,
  type DiscoveredAgentStatus,
} from "@/app/api/discoveryApi";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { ClaimAgentDialog, QuarantineAgentDialog } from "./ClaimAgentDialog";

type Filter = "all" | "unregistered" | "registered" | "quarantined" | "ignored";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "unregistered", label: "Needs decision" },
  { key: "registered", label: "Registered" },
  { key: "quarantined", label: "Quarantined" },
  { key: "ignored", label: "Ignored" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<DiscoveredAgentStatus, string> = {
  unregistered: "bg-(--color-warning-soft) text-(--color-warning-text)",
  registered: "bg-(--color-success-soft) text-(--color-success-text)",
  quarantined: "bg-(--color-danger-soft) text-(--color-danger-text)",
  ignored: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: DiscoveredAgentStatus }) {
  return (
    <span className={`${PILL} ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function matchedOn(agent: DiscoveredAgent): string[] {
  const raw = agent.metadata?.matched_on;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export default function DiscoveredAgentsPage() {
  // Status filtering is server-side (indexed on workspace_id, status, origin);
  // free-text search stays client-side over the returned page.
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isError, error, refetch } = useListDiscoveredAgentsQuery(
    filter === "all" ? undefined : { status: filter },
  );
  const { data: coverage } = useGetAgentCoverageQuery();
  // matched_client_id is an mcp_oauth_clients.id. Resolve it to a name so the
  // column reads as an identity rather than as an opaque uuid prefix.
  const { data: clients } = useListWorkspaceClientsQuery();
  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients ?? []) m.set(c.id, c.client_name || c.client_id);
    return m;
  }, [clients]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DiscoveredAgent | null>(null);
  const [claimTarget, setClaimTarget] = useState<DiscoveredAgent | null>(null);
  const [quarantineTarget, setQuarantineTarget] = useState<DiscoveredAgent | null>(null);

  const agents = useMemo(() => data?.agents ?? [], [data]);

  const items = useMemo(() => {
    let list = agents;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        [a.display_name, a.fingerprint, SOURCE_LABELS[a.source]]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [agents, search]);

  const columns = useMemo<AdaptiveColumn<DiscoveredAgent>[]>(
    () => [
      {
        id: "agent",
        header: "Sighting",
        alwaysVisible: true,
        approxWidth: 280,
        // max-w is required: the table is tableLayout:auto, where `truncate`
        // alone does not constrain a cell — the column still grows to fit a long
        // fingerprint and pushes the table past its container.
        cell: ({ row }) => (
          <div className="max-w-[260px]">
            <EntityCell
              label={row.original.display_name || "Unnamed"}
              detail={row.original.fingerprint}
              monoDetail
            />
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABELS[row.original.source]}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: "origin",
        header: "Origin",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span
            className={
              row.original.deployment_origin === "manual"
                ? "text-xs font-medium text-(--color-warning-text)"
                : "text-xs text-muted-foreground"
            }
            title={
              row.original.deployment_origin === "manual"
                ? "Run by a person, not a pipeline — permissions are typically whatever that developer's own credentials allow."
                : undefined
            }
          >
            {ORIGIN_LABELS[row.original.deployment_origin]}
          </span>
        ),
      },
      {
        id: "archetype",
        header: "Authority",
        priority: 5,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {ARCHETYPE_LABELS[row.original.archetype]}
          </span>
        ),
      },
      {
        id: "matched",
        header: "Matched identity",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) => {
          const cid = row.original.matched_client_id;
          if (!cid) return <span className="text-xs text-muted-foreground">Unmatched</span>;
          const name = clientNameById.get(cid);
          // Fall back to the uuid prefix when the client list has not landed yet
          // or the row points at a client outside the current page of results.
          return name ? (
            <span className="block max-w-[150px] truncate text-xs" title={name}>
              {name}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">{cid.slice(0, 8)}…</span>
          );
        },
      },
      {
        id: "last_seen_at",
        header: "Last seen",
        priority: 6,
        approxWidth: 150,
        cell: ({ row }) => (
          <div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.last_seen_at), { addSuffix: true })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {row.original.sighting_count} sighting
              {row.original.sighting_count === 1 ? "" : "s"}
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const agent = row.original;
          const actions: ConsoleActionItem[] = [
            { label: "View details", onSelect: () => setSelected(agent) },
          ];
          // status only moves forward: an unregistered agent can be claimed or
          // quarantined; anything else is already decided.
          if (agent.status === "unregistered") {
            actions.unshift(
              { label: "Claim…", onSelect: () => setClaimTarget(agent) },
              {
                label: "Quarantine…",
                destructive: true,
                onSelect: () => setQuarantineTarget(agent),
              },
            );
          }
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions items={actions} />
            </div>
          );
        },
      },
    ],
    // clientNameById must be here: it is empty on first render and the matched
    // identity column would otherwise keep rendering uuid prefixes forever.
    [clientNameById],
  );

  return (
    <ConsolePage
      title="Discovered Agents"
      description="Agent sightings from every discovery channel, deduped by fingerprint. Unmatched sightings need a decision: provision or quarantine."
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the inventory.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {coverage ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Coverage
            </div>
            <div className="text-lg font-semibold">
              {coverage.coverage_percent.toFixed(0)}%
            </div>
            <div className="text-[11px] text-muted-foreground">
              {coverage.registered} of {coverage.total} governed
            </div>
          </div>
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Needs a decision
            </div>
            <div className="text-lg font-semibold">{coverage.unregistered}</div>
            <div className="text-[11px] text-muted-foreground">
              No owner until claimed
            </div>
          </div>
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Manual origin
            </div>
            <div className="text-lg font-semibold">
              {coverage.by_origin?.manual?.total ?? 0}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Higher risk — no pipeline behind them
            </div>
          </div>
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Quarantined
            </div>
            <div className="text-lg font-semibold">{coverage.quarantined}</div>
            <div className="text-[11px] text-muted-foreground">Blocked from claiming</div>
          </div>
        </div>
      ) : null}



      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or fingerprint…"
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="discovered-agents"
            columns={columns}
            data={items}
            getRowId={(a) => a.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(a) => setSelected(a)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <RightDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaTitle="Discovered agent details"
      >
        {selected ? (
          <>
            <DrawerHeader
              title={selected.display_name || "Unnamed sighting"}
              subtitle={SOURCE_LABELS[selected.source]}
              badge={<StatusPill status={selected.status} />}
            />
            <DrawerBody>
              <DrawerSection label="Identity">
                <DetailGrid>
                  <DetailRow
                    label="Fingerprint"
                    value={<CopyField value={selected.fingerprint} />}
                    full
                  />
                  <DetailRow
                    label="Matched client"
                    value={
                      selected.matched_client_id ? (
                        <CopyField value={selected.matched_client_id} />
                      ) : (
                        "Unmatched"
                      )
                    }
                    full
                  />
                  <DetailRow
                    label="Origin"
                    value={ORIGIN_LABELS[selected.deployment_origin]}
                  />
                  <DetailRow
                    label="Authority source"
                    value={ARCHETYPE_LABELS[selected.archetype]}
                  />
                  <DetailRow label="Sightings" value={String(selected.sighting_count)} />
                  <DetailRow
                    label="First seen"
                    value={formatDistanceToNow(new Date(selected.first_seen_at), {
                      addSuffix: true,
                    })}
                  />
                  <DetailRow
                    label="Last seen"
                    value={formatDistanceToNow(new Date(selected.last_seen_at), {
                      addSuffix: true,
                    })}
                  />
                </DetailGrid>
              </DrawerSection>

              {selected.status === "quarantined" && selected.quarantine_reason ? (
                <DrawerSection label="Quarantine reason">
                  <p className="text-xs text-muted-foreground">
                    {selected.quarantine_reason}
                  </p>
                </DrawerSection>
              ) : null}

              {matchedOn(selected).length > 0 ? (
                <DrawerSection label="Why this was flagged">
                  <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                    {matchedOn(selected).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </DrawerSection>
              ) : null}

              <DrawerSection label="Source metadata">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </DrawerSection>
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>

      <ClaimAgentDialog
        agent={claimTarget}
        open={claimTarget !== null}
        onOpenChange={(o) => !o && setClaimTarget(null)}
        onDone={() => void refetch()}
      />
      <QuarantineAgentDialog
        agent={quarantineTarget}
        open={quarantineTarget !== null}
        onOpenChange={(o) => !o && setQuarantineTarget(null)}
        onDone={() => void refetch()}
      />
    </ConsolePage>
  );
}
