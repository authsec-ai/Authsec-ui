/**
 * Discovery → Discovered Agents
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). The quarantine-first
 * inventory: an agent is sighted, matched against known identities, and if
 * unmatched surfaced for a decision — provision or quarantine.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
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
  SOURCE_LABELS,
  useDiscoveredAgentsWithFallback,
  type DiscoveredAgent,
  type DiscoveredAgentStatus,
} from "@/app/api/discoveryApi";

type Filter = "all" | "new" | "registered" | "quarantined";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "new", label: "Needs decision" },
  { key: "registered", label: "Registered" },
  { key: "quarantined", label: "Quarantined" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<DiscoveredAgentStatus, string> = {
  new: "bg-(--color-warning-soft) text-(--color-warning-text)",
  registered: "bg-(--color-success-soft) text-(--color-success-text)",
  quarantined: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

const STATUS_LABEL: Record<DiscoveredAgentStatus, string> = {
  new: "Needs decision",
  registered: "Registered",
  quarantined: "Quarantined",
};

function StatusPill({ status }: { status: DiscoveredAgentStatus }) {
  return (
    <span className={`${PILL} ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function matchedOn(agent: DiscoveredAgent): string[] {
  const raw = agent.metadata?.matched_on;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export default function DiscoveredAgentsPage() {
  const { data, isLoading, usingMock } = useDiscoveredAgentsWithFallback();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<DiscoveredAgent | null>(null);

  const items = useMemo(() => {
    let list = data;
    if (filter !== "all") list = list.filter((a) => a.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        [a.display_name ?? "", a.fingerprint, SOURCE_LABELS[a.source]]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [data, search, filter]);

  const pendingCount = useMemo(() => data.filter((a) => a.status === "new").length, [data]);

  const decide = (agent: DiscoveredAgent, decision: "provision" | "quarantine") => {
    toast.success(
      decision === "provision"
        ? `${agent.display_name ?? agent.fingerprint} would be provisioned — no backend yet.`
        : `${agent.display_name ?? agent.fingerprint} would be quarantined — no backend yet.`,
    );
  };

  const columns = useMemo<AdaptiveColumn<DiscoveredAgent>[]>(
    () => [
      {
        id: "agent",
        header: "Sighting",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name ?? "Unnamed"}
            detail={row.original.fingerprint}
            monoDetail
          />
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
        id: "matched",
        header: "Matched identity",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) =>
          row.original.matched_client_id ? (
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.matched_client_id.slice(0, 8)}…
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Unmatched</span>
          ),
      },
      {
        id: "last_seen_at",
        header: "Last seen",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.last_seen_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 60,
        cell: ({ row }) => (
          <ConsoleRowActions
            actions={
              row.original.status === "new"
                ? [
                    { label: "Provision", onClick: () => decide(row.original, "provision") },
                    {
                      label: "Quarantine",
                      variant: "destructive" as const,
                      onClick: () => decide(row.original, "quarantine"),
                    },
                  ]
                : [{ label: "View details", onClick: () => setSelected(row.original) }]
            }
          />
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Discovered Agents"
      description="Agent sightings from every discovery channel, deduped by fingerprint. Unmatched sightings need a decision: provision or quarantine."
    >
      {usingMock ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Prototype data.</strong>{" "}
          <code>/authsec/discovery/agents</code> is not implemented — these rows are fixtures
          from <code>discoveryApi.ts</code>. Decisions are not persisted.
        </div>
      ) : null}

      {pendingCount > 0 ? (
        <div className="rounded-md border px-4 py-3 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">
            {pendingCount} sighting{pendingCount === 1 ? "" : "s"} awaiting a decision.
          </strong>{" "}
          An unmatched sighting has no accountable owner until it is provisioned.
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
            loading={isLoading}
            onRowClick={(agent) => setSelected(agent)}
          />
        </CardContent>
      </TableCard>

      <RightDrawer open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <>
            <DrawerHeader
              title={selected.display_name ?? "Unnamed sighting"}
              subtitle={SOURCE_LABELS[selected.source]}
              badge={<StatusPill status={selected.status} />}
            />
            <DrawerBody>
              <DrawerSection title="Identity">
                <DetailGrid>
                  <DetailRow label="Fingerprint">
                    <CopyField value={selected.fingerprint} />
                  </DetailRow>
                  <DetailRow label="Matched client">
                    {selected.matched_client_id ? (
                      <CopyField value={selected.matched_client_id} />
                    ) : (
                      "Unmatched"
                    )}
                  </DetailRow>
                  <DetailRow label="First seen">
                    {formatDistanceToNow(new Date(selected.first_seen_at), { addSuffix: true })}
                  </DetailRow>
                  <DetailRow label="Last seen">
                    {formatDistanceToNow(new Date(selected.last_seen_at), { addSuffix: true })}
                  </DetailRow>
                </DetailGrid>
              </DrawerSection>

              {matchedOn(selected).length > 0 ? (
                <DrawerSection title="Why this was flagged">
                  <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                    {matchedOn(selected).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </DrawerSection>
              ) : null}

              <DrawerSection title="Source metadata">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </DrawerSection>
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>
    </ConsolePage>
  );
}
