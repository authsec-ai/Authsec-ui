/**
 * Discovery → Discovered Agents
 *
 * The quarantine-first inventory. Two independent axes are rendered as two
 * badges and never merged:
 *
 *   status         what a human DECIDED    (unregistered → registered →
 *                                           quarantined → ignored; forward-only)
 *   runtime_status what was OBSERVED       (running ⇄ stopped → gone / unknown)
 *
 * An agent can be registered + gone (governed but destroyed) or unregistered +
 * running (live and ungoverned — the actionable case). Collapsing them would make
 * a destroyed agent look like it still needs a claim decision, which is wrong.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { GitBranch } from "lucide-react";

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
  EVIDENCE_LABELS,
  evidenceModeOf,
  ORIGIN_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  RUNTIME_STATUS_LABELS,
  useGetAgentCoverageQuery,
  useListDiscoveredAgentsQuery,
  type DiscoveredAgent,
  type DiscoveredAgentStatus,
  type RuntimeStatus,
} from "@/app/api/discoveryApi";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { GitHubEvidenceSection } from "./GitHubEvidenceSection";
import {
  ClaimAgentDialog,
  ClassifyAgentDialog,
  QuarantineAgentDialog,
  UnquarantineAgentDialog,
  DeleteAgentDialog,
} from "./ClaimAgentDialog";
import { AgentLifecycleTrail } from "./AgentLifecycleTrail";
import {
  ProvisionAgentDialog,
  DeprovisionAgentDialog,
} from "../governance/AgentProvisionDialogs";

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

/**
 * Observed vs declared.
 *
 * The inventory began as a list of things seen RUNNING, and a repository scan
 * cannot support that claim — a workflow file is a statement of intent that may
 * never have executed. Without this badge a declared finding reads as a live
 * process, which is the one misstatement this page must not make.
 */
function EvidencePill({ agent }: { agent: DiscoveredAgent }) {
  const mode = evidenceModeOf(agent);
  const style: Record<string, string> = {
    observed: "bg-(--color-success-soft) text-(--color-success-text)",
    declared: "bg-(--color-info-soft) text-(--color-info-text)",
    inferred: "bg-muted text-muted-foreground",
  };
  const title: Record<string, string> = {
    observed: "Seen running in a live environment.",
    declared:
      "Found written down in code — a CI/CD workflow, manifest or infrastructure file. It may or may not have ever run.",
    inferred: "Deduced from indirect signal; the weakest form of evidence.",
  };
  return (
    <span className={`${PILL} ${style[mode]}`} title={title[mode]}>
      {EVIDENCE_LABELS[mode]}
    </span>
  );
}

const STATUS_STYLE: Record<DiscoveredAgentStatus, string> = {
  unregistered: "bg-(--color-warning-soft) text-(--color-warning-text)",
  registered: "bg-(--color-success-soft) text-(--color-success-text)",
  quarantined: "bg-(--color-danger-soft) text-(--color-danger-text)",
  ignored: "bg-muted text-muted-foreground",
};

// The runtime axis is styled distinctly from the decision axis so the two badges
// never read as one status. Running is neutral (it's the norm, not a success
// state to celebrate); gone is muted-strikethrough-ish; stopped is a warning.
const RUNTIME_STYLE: Record<RuntimeStatus, string> = {
  running: "bg-muted text-foreground",
  stopped: "bg-(--color-warning-soft) text-(--color-warning-text)",
  gone: "bg-muted text-muted-foreground line-through decoration-muted-foreground/50",
  unknown: "bg-muted text-muted-foreground",
};

export function StatusPill({ status }: { status: DiscoveredAgentStatus }) {
  return (
    <span className={`${PILL} ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RuntimeStatusPill({ runtime }: { runtime: RuntimeStatus }) {
  return (
    <span className={`${PILL} ${RUNTIME_STYLE[runtime]}`} title="Observed runtime state">
      {RUNTIME_STATUS_LABELS[runtime]}
    </span>
  );
}

/** Quarantined on paper but the NetworkPolicy never landed — running with full access. */
function isEnforcementGap(a: DiscoveredAgent): boolean {
  return a.status === "quarantined" && !a.quarantine_enforced_at;
}

function matchedOn(agent: DiscoveredAgent): string[] {
  const raw = agent.metadata?.matched_on;
  return Array.isArray(raw) ? raw.map(String) : [];
}

// Sort order for the runtime axis: gone always last regardless of origin, so a
// destroyed agent never sits at the top of a queue asking for a decision.
const RUNTIME_SORT: Record<RuntimeStatus, number> = {
  running: 0,
  unknown: 1,
  stopped: 2,
  gone: 3,
};

/**
 * The non-default ref a finding came from, or null when it is on the default
 * branch (or did not come from a repository scan).
 *
 * Read from the scan's own metadata rather than parsed back out of the
 * fingerprint. Both carry it, but the fingerprint's ref-qualified form exists
 * for identity, not display — and findings recorded before branch scanning
 * deliberately kept the older ref-free key, so parsing would quietly disagree
 * with the record for exactly the rows that matter.
 */
function nonDefaultBranch(agent: DiscoveredAgent): string | null {
  const meta = (agent.metadata ?? {}) as Record<string, unknown>;
  if (meta["is_default_branch"] !== false) return null;
  const b = meta["branch"];
  return typeof b === "string" && b !== "" ? b : null;
}

export default function DiscoveredAgentsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  // The queue defaults to live agents only: a long-gone agent needs no decision,
  // and including it makes coverage look worse than the actionable reality.
  const [liveOnly, setLiveOnly] = useState(true);

  const { data, isError, error, refetch } = useListDiscoveredAgentsQuery({
    ...(filter === "all" ? {} : { status: filter }),
    ...(liveOnly ? { live: true } : {}),
  });
  const { data: coverage } = useGetAgentCoverageQuery();
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
  const [unquarantineTarget, setUnquarantineTarget] = useState<DiscoveredAgent | null>(null);
  const [classifyTarget, setClassifyTarget] = useState<DiscoveredAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveredAgent | null>(null);
  const [provisionTarget, setProvisionTarget] = useState<DiscoveredAgent | null>(null);
  const [deprovisionTarget, setDeprovisionTarget] = useState<DiscoveredAgent | null>(null);

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
    // gone last, then by last_seen desc within a runtime tier.
    return [...list].sort((a, b) => {
      const r = RUNTIME_SORT[a.runtime_status] - RUNTIME_SORT[b.runtime_status];
      if (r !== 0) return r;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
  }, [agents, search]);

  const columns = useMemo<AdaptiveColumn<DiscoveredAgent>[]>(
    () => [
      {
        id: "agent",
        header: "Sighting",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => {
          const branch = nonDefaultBranch(row.original);
          return (
            <div className="max-w-[260px]">
              <EntityCell
                label={row.original.display_name || "Unnamed"}
                detail={row.original.fingerprint}
                monoDetail
              />
              {/* Two rows for the same file on different branches are NOT a
                  duplicate — they are two different declarations — but they read
                  as one until the branch is on screen. Only non-default refs are
                  marked: a declaration on a feature branch is proposed, not what
                  runs today. */}
              {branch && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  <GitBranch className="size-2.5" />
                  {branch}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "source",
        header: "Source",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABELS[row.original.source]}
          </span>
        ),
      },
      {
        id: "evidence",
        header: "Evidence",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => <EvidencePill agent={row.original} />,
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 200,
        // Two distinct badges — the decided axis and the observed axis — plus an
        // explicit enforcement-gap flag when a quarantine never landed.
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={row.original.status} />
            <RuntimeStatusPill runtime={row.original.runtime_status} />
            {isEnforcementGap(row.original) ? (
              <span
                className={`${PILL} bg-(--color-danger-soft) text-(--color-danger-text)`}
                title={
                  row.original.quarantine_enforcement_error ||
                  "Quarantine decided but no NetworkPolicy has landed — the agent is still running with full network access."
                }
              >
                Not enforced
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "origin",
        header: "Origin",
        priority: 4,
        approxWidth: 110,
        cell: ({ row }) => (
          <span
            className={
              row.original.deployment_origin === "manual"
                ? "text-xs font-medium text-(--color-warning-text)"
                : "text-xs text-muted-foreground"
            }
          >
            {ORIGIN_LABELS[row.original.deployment_origin]}
          </span>
        ),
      },
      {
        id: "matched",
        header: "Matched identity",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => {
          const cid = row.original.matched_client_id;
          if (!cid) return <span className="text-xs text-muted-foreground">Unmatched</span>;
          const name = clientNameById.get(cid);
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
        approxWidth: 140,
        cell: ({ row }) => {
          // For a declared finding this timestamp means "the file was still
          // there", not "the agent was still running". Label it as such rather
          // than letting the column header imply liveness.
          const declared = evidenceModeOf(row.original) === "declared";
          return (
            <div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(row.original.last_seen_at), {
                  addSuffix: true,
                })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {declared
                  ? `still declared · ${row.original.sighting_count} scan${
                      row.original.sighting_count === 1 ? "" : "s"
                    }`
                  : `${row.original.sighting_count} sighting${
                      row.original.sighting_count === 1 ? "" : "s"
                    }`}
              </div>
            </div>
          );
        },
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
            { label: "Correct classification…", onSelect: () => setClassifyTarget(agent) },
          ];
          // The decided axis only moves forward: an unregistered agent can be
          // claimed or quarantined; a quarantined one can be released. A gone
          // agent gets no claim/quarantine action — there's nothing to govern.
          if (agent.status === "unregistered" && agent.runtime_status !== "gone") {
            actions.unshift(
              { label: "Claim…", onSelect: () => setClaimTarget(agent) },
              {
                label: "Quarantine…",
                destructive: true,
                onSelect: () => setQuarantineTarget(agent),
              },
            );
          }
          // Provisioning is what makes a claim mean something — bind an identity
          // and create entitlements. Offered on a claimed (registered) agent.
          if (agent.status === "registered") {
            actions.unshift(
              { label: "Provision access…", onSelect: () => setProvisionTarget(agent) },
              {
                label: "Deprovision…",
                destructive: true,
                onSelect: () => setDeprovisionTarget(agent),
              },
            );
          }
          if (agent.status === "quarantined") {
            actions.unshift({
              label: "Release quarantine…",
              onSelect: () => setUnquarantineTarget(agent),
            });
          }
          // Delete is a cleanup tool for bad rows, kept out of the common path.
          actions.push({
            label: "Delete inventory row…",
            destructive: true,
            onSelect: () => setDeleteTarget(agent),
          });
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions items={actions} />
            </div>
          );
        },
      },
    ],
    [clientNameById],
  );

  return (
    <ConsolePage
      title="Discovered Agents"
      description="Agent sightings from every discovery channel, deduped by fingerprint. Unmatched sightings that are still running need a decision: provision or quarantine."
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
          {/* The ACTIONABLE KPI: unregistered AND still live. This is how a team
              watches coverage stall short of 100% with nothing left to claim. */}
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Live &amp; unclaimed
            </div>
            <div className="text-lg font-semibold text-(--color-warning-text)">
              {coverage.live_unregistered}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Running now, no owner — {coverage.unregistered} unregistered in total
            </div>
          </div>
          <div className="rounded-md border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Gone
            </div>
            <div className="text-lg font-semibold">
              {coverage.by_runtime_status?.gone ?? 0}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Destroyed — evidence they existed
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
        trailing={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={liveOnly}
              onChange={(e) => setLiveOnly(e.target.checked)}
              className="size-3.5 accent-(--color-primary)"
            />
            Live only
          </label>
        }
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
              badge={
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusPill status={selected.status} />
                  <RuntimeStatusPill runtime={selected.runtime_status} />
                </span>
              }
            />
            <DrawerBody>
              {/* Enforcement gap gets a loud panel — it is a third distinct state. */}
              {isEnforcementGap(selected) ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs text-(--color-danger-text)">
                  <strong className="font-medium">Quarantined on paper, not enforced.</strong>{" "}
                  <span className="text-foreground/80">
                    The decision was recorded but no NetworkPolicy has landed, so this agent is
                    still running with full network access.
                    {selected.quarantine_enforcement_error
                      ? ` ${selected.quarantine_enforcement_error}`
                      : " There is likely no actuation agent in this cluster."}
                  </span>
                </div>
              ) : null}

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
                    label="Runs as"
                    value={selected.observed_service_account || "Not observed"}
                  />
                  <DetailRow
                    label="Identity verified"
                    value={
                      selected.identity_verified_at
                        ? formatDistanceToNow(new Date(selected.identity_verified_at), {
                            addSuffix: true,
                          })
                        : "Not verified"
                    }
                  />
                  <DetailRow
                    label="Origin"
                    value={
                      // For a declaration "unknown" is the honest answer, not
                      // missing data: a parsed file does not say how the thing
                      // was deployed.
                      evidenceModeOf(selected) === "declared" &&
                      selected.deployment_origin === "unknown"
                        ? "Not established — a declaration does not say how it was deployed"
                        : ORIGIN_LABELS[selected.deployment_origin]
                    }
                    full
                  />
                  <DetailRow
                    label="Authority source"
                    value={ARCHETYPE_LABELS[selected.archetype]}
                  />
                </DetailGrid>
              </DrawerSection>

              <DrawerSection label="Runtime">
                <DetailGrid>
                  <DetailRow
                    label="Observed state"
                    value={RUNTIME_STATUS_LABELS[selected.runtime_status]}
                  />
                  <DetailRow
                    label="Observed"
                    value={
                      selected.runtime_observed_at
                        ? formatDistanceToNow(new Date(selected.runtime_observed_at), {
                            addSuffix: true,
                          })
                        : "—"
                    }
                  />
                  {selected.runtime_reason ? (
                    <DetailRow label="Reason" value={selected.runtime_reason} full />
                  ) : null}
                  {selected.terminated_at ? (
                    <DetailRow
                      label="Terminated"
                      value={`${formatDistanceToNow(new Date(selected.terminated_at), {
                        addSuffix: true,
                      })}${selected.terminated_by ? ` by ${selected.terminated_by}` : ""}`}
                      full
                    />
                  ) : null}
                  <DetailRow
                    label={evidenceModeOf(selected) === "declared" ? "Scans" : "Sightings"}
                    value={String(selected.sighting_count)}
                  />
                  <DetailRow
                    label={
                      evidenceModeOf(selected) === "declared"
                        ? "Last confirmed present"
                        : "Last seen running"
                    }
                    value={formatDistanceToNow(new Date(selected.last_seen_at), {
                      addSuffix: true,
                    })}
                  />
                </DetailGrid>
              </DrawerSection>

              <GitHubEvidenceSection agent={selected} />

              {/* Quarantine history — the pair survives a release, so read `status`,
                  not the presence of quarantined_at, to know if it's current. */}
              {selected.quarantined_at ? (
                <DrawerSection label="Quarantine history">
                  <p className="text-xs text-muted-foreground">
                    Quarantined{" "}
                    {formatDistanceToNow(new Date(selected.quarantined_at), { addSuffix: true })}
                    {selected.quarantine_reason ? ` for: ${selected.quarantine_reason}` : ""}.
                    {selected.quarantine_released_at ? (
                      <>
                        {" "}
                        Released{" "}
                        {formatDistanceToNow(new Date(selected.quarantine_released_at), {
                          addSuffix: true,
                        })}
                        {selected.quarantine_released_by
                          ? ` by ${selected.quarantine_released_by}`
                          : ""}
                        .
                      </>
                    ) : selected.quarantine_enforced_at ? (
                      <> Enforced by a NetworkPolicy.</>
                    ) : (
                      <> Not yet enforced.</>
                    )}
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

              <DrawerSection label="Lifecycle trail">
                <AgentLifecycleTrail agentId={selected.id} />
              </DrawerSection>

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
      <UnquarantineAgentDialog
        agent={unquarantineTarget}
        open={unquarantineTarget !== null}
        onOpenChange={(o) => !o && setUnquarantineTarget(null)}
        onDone={() => void refetch()}
      />
      <ClassifyAgentDialog
        agent={classifyTarget}
        open={classifyTarget !== null}
        onOpenChange={(o) => !o && setClassifyTarget(null)}
        onDone={() => void refetch()}
      />
      <DeleteAgentDialog
        agent={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDone={() => {
          setSelected(null);
          void refetch();
        }}
      />
      <ProvisionAgentDialog
        agent={provisionTarget}
        open={provisionTarget !== null}
        onOpenChange={(o) => !o && setProvisionTarget(null)}
        onDone={() => void refetch()}
      />
      <DeprovisionAgentDialog
        agent={deprovisionTarget}
        open={deprovisionTarget !== null}
        onOpenChange={(o) => !o && setDeprovisionTarget(null)}
        onDone={() => void refetch()}
      />
    </ConsolePage>
  );
}
