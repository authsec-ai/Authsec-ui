/**
 * Discovery › AWS › AI workloads: identities seen calling a model, labelled
 * "AI workload", "Suggested agent" or "Agent", with the coverage window of
 * the evidence and the findings about risky credentials. It lists what the
 * evidence shows, per source and per window; it never says "all agents".
 */

import { useMemo, useState } from "react";

import {
  useListAgentFindingsQuery,
  useListAgentSuggestionsQuery,
  useListAiWorkloadsQuery,
  type AIWorkload,
  type AgentFinding,
  type AgentLabel,
  type AgentSuggestion,
} from "@/app/api/igaAgentRuntimeApi";
import { ConsoleFilterBar } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerBody, DrawerHeader } from "@/components/console/detail";

import { AiWorkloadDrawer } from "./AiWorkloadDrawer";
import { ContainDialog, type ContainTarget } from "./ContainDialog";
import { FindingEvidence } from "./FindingEvidence";
import { FINDING_TEXT, LABEL_TEXT, classifyAr, coverageText, shortTime } from "./model";
import { LabelChip, NotAvailable, ReadFailure } from "./parts";
import { SuggestionDialog, type SuggestionDecision } from "./SuggestionDialogs";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";

const LABELS: AgentLabel[] = ["ai_workload", "suggested_agent", "agent"];
type Section = "workloads" | "findings";

export default function AiWorkloadsScreen({ ws, connectorId }: { ws: string; connectorId?: string }) {
  const caps = useAgentRuntimeCaps(ws, "agent_runtime");
  const contain = useAgentRuntimeCaps(ws, "agent_containment");
  const [section, setSection] = useState<Section>("workloads");

  if (caps.state !== "available") {
    return (
      <div className="p-4">
        <NotAvailable caps={caps} what="AI workloads and findings" />
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-(--color-text-muted)">
        Shows what the evidence read so far supports, per source and per window: model calls that CloudTrail reported to AuthSec, and platform-declared agents. It does not claim to list every agent. Calls made through a trail
        without data events, or to a non-AWS provider, are not seen.
      </p>
      <div role="tablist" aria-label="View" className="flex gap-1">
        {(["workloads", "findings"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            className={`h-8 rounded-md border px-3 text-xs font-semibold ${section === s ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)" : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted)"}`}
          >
            {s === "workloads" ? "AI workloads" : "Findings"}
          </button>
        ))}
      </div>
      {section === "workloads" ? <WorkloadsList ws={ws} connectorId={connectorId} containOn={contain.state === "available"} /> : <FindingsList ws={ws} connectorId={connectorId} />}
    </div>
  );
}

function WorkloadsList({ ws, connectorId, containOn }: { ws: string; connectorId?: string; containOn: boolean }) {
  const [label, setLabel] = useState<"" | AgentLabel>("");
  const [search, setSearch] = useState("");
  const list = useListAiWorkloadsQuery({ ws, connector_id: connectorId, limit: 200 });
  const pending = useListAgentSuggestionsQuery({ ws, state: "pending", connector_id: connectorId, limit: 200 });
  const [open, setOpen] = useState<AIWorkload | null>(null);
  const [decision, setDecision] = useState<{ s: AgentSuggestion; d: SuggestionDecision } | null>(null);
  const [containing, setContaining] = useState<ContainTarget | null>(null);

  const suggestions = useMemo(() => new Map((pending.data?.data ?? []).map((s) => [s.id, s] as const)), [pending.data]);
  const all = useMemo(() => list.data?.data ?? [], [list.data]);
  const counts = useMemo(() => {
    const c: Record<AgentLabel, number> = { ai_workload: 0, suggested_agent: 0, agent: 0 };
    for (const a of all) c[a.label] = (c[a.label] ?? 0) + 1;
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((a) => (!label || a.label === label) && (!q || [a.identity.name, a.identity.arn, ...a.workloads.map((w) => w.name)].some((t) => t.toLowerCase().includes(q))));
  }, [all, label, search]);

  const failure = classifyAr(list.error);
  const openSuggestion = open?.suggestion ? suggestions.get(open.suggestion.id) ?? null : null;
  // Re-read the open row when the list refreshes after a decision.
  const current = open ? all.find((a) => a.identity.id === open.identity.id) ?? open : null;

  const columns = useMemo<AdaptiveColumn<AIWorkload>[]>(
    () => [
      {
        id: "label",
        header: "Label",
        label: "Label",
        alwaysVisible: true,
        approxWidth: 150,
        cell: ({ row }) => <LabelChip label={row.original.label} />,
        detail: (a) => LABEL_TEXT[a.label],
      },
      {
        id: "identity",
        header: "Identity",
        label: "Identity",
        primary: true,
        alwaysVisible: true,
        minWidth: 240,
        approxWidth: 280,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium" title={row.original.identity.arn}>
              {row.original.identity.name || row.original.identity.arn}
            </div>
            <div className="truncate text-xs text-(--color-text-secondary)">{row.original.identity.kind.replace(/_/g, " ")}</div>
          </div>
        ),
        detail: (a) => a.identity.arn,
      },
      {
        id: "workload",
        header: "Workload",
        label: "Workload",
        priority: 2,
        approxWidth: 220,
        cell: ({ row }) => {
          const a = row.original;
          const n = a.workloads.length + a.k8s_service_accounts.length;
          return (
            <div className="min-w-0 text-[13px]">
              <div className="truncate">{n === 0 ? "None collected" : n === 1 ? a.workloads[0]?.name ?? a.k8s_service_accounts[0] : `${n} workloads`}</div>
              {a.shared_role ? (
                <StatusBadge tone="warning" title="Several workloads run as this role. Calls cannot be tied to one of them.">
                  Shared role
                </StatusBadge>
              ) : null}
            </div>
          );
        },
        detail: (a) => a.workloads.map((w) => w.name).join(", ") || "None collected",
      },
      {
        id: "activity",
        header: "Calls, models, last call",
        label: "Activity",
        priority: 1,
        approxWidth: 240,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="text-[13px]">
              <div>
                {a.calls} calls{a.denied ? `, ${a.denied} refused` : ""} · {Object.keys(a.models).length} models
              </div>
              <div className="text-xs text-(--color-text-secondary)">Last call {shortTime(a.last_call_at)}</div>
            </div>
          );
        },
        detail: (a) => `${a.calls} calls, ${Object.keys(a.models).length} models, last ${shortTime(a.last_call_at)}`,
      },
      {
        id: "coverage",
        header: "Window covered",
        label: "Coverage",
        priority: 3,
        approxWidth: 240,
        cell: ({ row }) => (
          <div className="text-xs">
            {coverageText(row.original.coverage)}
            {row.original.coverage.partial ? (
              <span className="ml-1 inline-block">
                <StatusBadge tone="warning" title="Part of the interval was not read. Absence of calls there is unknown.">
                  Partial
                </StatusBadge>
              </span>
            ) : null}
          </div>
        ),
        detail: (a) => coverageText(a.coverage),
      },
    ],
    [],
  );

  return (
    <>
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by identity or workload"
        filters={[{ key: "", label: "All", count: all.length }, ...LABELS.map((l) => ({ key: l, label: LABEL_TEXT[l], count: counts[l] }))]}
        activeFilter={label}
        onFilterChange={(k) => setLabel(k as "" | AgentLabel)}
      />
      {failure && !list.data ? <ReadFailure failure={failure} subject="AI workloads" onRetry={() => void list.refetch()} /> : null}
      {!failure || list.data ? (
        <div className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="agent-runtime-ai-workloads"
              data={rows}
              columns={columns}
              getRowId={(a) => a.identity.id}
              enableSelection={false}
              sizing="fit"
              loading={list.isLoading}
              onRowClick={(a) => setOpen(a)}
              emptyState={
                <div className="mx-auto max-w-md space-y-1 py-6 text-center text-sm text-(--color-text-muted)">
                  <p className="font-semibold text-(--color-text)">{all.length ? "No AI workloads match these filters" : "No AI workloads seen yet"}</p>
                  <p className="text-[13px]">
                    {all.length ? "Clear a filter to see the rest." : "None has been seen in the window AuthSec has read. That is not proof that none exists: see each connection's coverage and its event stream."}
                  </p>
                </div>
              }
            />
          </CardContent>
        </div>
      ) : null}
      {list.data?.meta.next_cursor ? <p className="text-xs text-(--color-text-muted)">Showing the first {all.length}. Use the label filter or search to narrow.</p> : null}

      <AiWorkloadDrawer
        ai={current}
        suggestion={openSuggestion}
        canDecide
        canContain={containOn}
        onClose={() => setOpen(null)}
        onConfirm={(s) => setDecision({ s, d: "confirm" })}
        onDismiss={(s) => setDecision({ s, d: "dismiss" })}
        onContain={(a) => setContaining({ identityId: a.identity.id, identityName: a.identity.name || a.identity.arn, workloads: a.workloads.map((w) => ({ id: w.cloud_workload_id, name: w.name })) })}
      />
      <SuggestionDialog suggestion={decision ? suggestions.get(decision.s.id) ?? decision.s : null} decision={decision?.d ?? null} onClose={() => setDecision(null)} />
      <ContainDialog target={containing} onClose={() => setContaining(null)} />
    </>
  );
}

function FindingsList({ ws, connectorId }: { ws: string; connectorId?: string }) {
  const [state, setState] = useState<"open" | "resolved">("open");
  const q = useListAgentFindingsQuery({ ws, state, connector_id: connectorId, limit: 200 });
  const [open, setOpen] = useState<AgentFinding | null>(null);
  const failure = classifyAr(q.error);

  const columns = useMemo<AdaptiveColumn<AgentFinding>[]>(
    () => [
      {
        id: "kind",
        header: "Finding",
        label: "Finding",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        approxWidth: 260,
        cell: ({ row }) => <span className="text-[13px] font-medium">{FINDING_TEXT[row.original.kind] ?? row.original.kind}</span>,
      },
      {
        id: "subject",
        header: "Subject",
        label: "Subject",
        priority: 1,
        approxWidth: 320,
        cell: ({ row }) => {
          const s = row.original.subject as { name?: string; arn?: string };
          return <span className="block truncate text-[13px]" title={s.arn}>{s.name || s.arn || row.original.subject_key}</span>;
        },
        detail: (f) => String((f.subject as { arn?: string }).arn ?? f.subject_key),
      },
      {
        id: "seen",
        header: "Last seen",
        label: "Last seen",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => <span className="text-[13px]">{shortTime(row.original.last_seen)}</span>,
        detail: (f) => shortTime(f.last_seen),
      },
    ],
    [],
  );

  return (
    <>
      <div role="radiogroup" aria-label="State" className="flex items-center gap-1.5">
        {(["open", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={state === s}
            onClick={() => setState(s)}
            className={`h-8 rounded-md border px-2.5 text-xs font-semibold capitalize ${state === s ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)" : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted)"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {failure && !q.data ? <ReadFailure failure={failure} subject="findings" onRetry={() => void q.refetch()} /> : null}
      {!failure || q.data ? (
        <div className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="agent-runtime-findings"
              data={q.data?.data ?? []}
              columns={columns}
              getRowId={(f) => f.id}
              enableSelection={false}
              sizing="fit"
              loading={q.isLoading}
              onRowClick={(f) => setOpen(f)}
              emptyState={<p className="py-6 text-center text-sm text-(--color-text-muted)">No {state} findings in the evidence read so far.</p>}
            />
          </CardContent>
        </div>
      ) : null}
      <RightDrawer open={!!open} onClose={() => setOpen(null)} width={520} ariaTitle="Finding detail" ariaDescription="The evidence behind one agent runtime finding.">
        {open ? (
          <>
            <DrawerHeader title={FINDING_TEXT[open.kind] ?? open.kind} subtitle={open.state === "open" ? "Open" : `Resolved ${shortTime(open.resolved_at)}`} />
            <DrawerBody>
              <FindingEvidence finding={open} />
              <Button variant="outline" size="sm" onClick={() => setOpen(null)}>
                Close
              </Button>
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>
    </>
  );
}
