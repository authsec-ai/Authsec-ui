/**
 * Agent runtime alerts (SPEC-agent-runtime-visibility.md §5.7): dangerous
 * actions by an AI workload or agent, D1 to D8. Route /iga/agent-runtime/alerts;
 * the Slack and SIEM links point to /iga/agent-runtime/alerts/:id.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";

import { useListAgentAlertsQuery, type AgentAlert, type AlertSeverity, type AlertState } from "@/app/api/igaAgentRuntimeApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { getWorkspaceId } from "@/utils/workspace";

import { AlertStateChip, SeverityChip } from "./alertParts";
import { classifyAr, detectionText, shortTime, chipButtonClass, subjectLabelText } from "./model";
import { NotAvailable, ReadFailure } from "./parts";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";

const STATES: AlertState[] = ["open", "acknowledged", "resolved"];
const SEVERITIES: AlertSeverity[] = ["high", "medium"];

export default function AlertsPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const caps = useAgentRuntimeCaps(ws, "agent_alerts");
  const [state, setState] = useState<"" | AlertState>("");
  const [severity, setSeverity] = useState<"" | AlertSeverity>("");
  const list = useListAgentAlertsQuery(
    { ws, state: state || undefined, severity: severity || undefined, limit: 200 },
    { skip: caps.state !== "available", pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const failure = classifyAr(list.error);

  const columns = useMemo<AdaptiveColumn<AgentAlert>[]>(
    () => [
      {
        id: "severity",
        header: "Severity",
        label: "Severity",
        alwaysVisible: true,
        approxWidth: 110,
        cell: ({ row }) => <SeverityChip severity={row.original.severity} />,
        detail: (a) => a.severity,
      },
      {
        id: "detection",
        header: "Detection",
        label: "Detection",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to={`/iga/agent-runtime/alerts/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate text-[13px] font-medium hover:text-(--color-primary-text) hover:underline"
            >
              {row.original.detection} {detectionText(row.original.detection)}
            </Link>
            <div className="truncate text-xs text-(--color-text-secondary)" title={row.original.title}>{row.original.title}</div>
          </div>
        ),
        detail: (a) => `${a.detection} ${detectionText(a.detection)}`,
      },
      {
        id: "identity",
        header: "Identity",
        label: "Identity",
        priority: 1,
        approxWidth: 240,
        cell: ({ row }) => (
          <div className="min-w-0 text-[13px]">
            <div className="truncate" title={row.original.subject_name}>{row.original.subject_name || row.original.identity_id}</div>
            <div className="text-xs text-(--color-text-secondary)">{subjectLabelText(row.original.subject_label)}</div>
          </div>
        ),
        detail: (a) => a.subject_name,
      },
      {
        id: "workload",
        header: "Workload",
        label: "Workload",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => {
          const n = row.original.workload_ids?.length ?? 0;
          return <span className="text-[13px]">{n === 0 ? "None collected" : n === 1 ? "1 workload" : `${n} workloads`}</span>;
        },
        detail: (a) => `${a.workload_ids?.length ?? 0} workloads`,
      },
      {
        id: "seen",
        header: "First / last seen",
        label: "Seen",
        priority: 2,
        approxWidth: 200,
        cell: ({ row }) => (
          <div className="text-xs">
            <div>{shortTime(row.original.first_seen)}</div>
            <div className="text-(--color-text-secondary)">{shortTime(row.original.last_seen)}</div>
          </div>
        ),
        detail: (a) => `${shortTime(a.first_seen)} to ${shortTime(a.last_seen)}`,
      },
      {
        id: "count",
        header: "Events",
        label: "Events",
        priority: 3,
        approxWidth: 80,
        cell: ({ row }) => <span className="tabular-nums text-[13px]">{row.original.event_count}</span>,
        detail: (a) => String(a.event_count),
      },
      {
        id: "state",
        header: "State",
        label: "State",
        alwaysVisible: true,
        approxWidth: 140,
        cell: ({ row }) => <AlertStateChip state={row.original.state} />,
        detail: (a) => a.state,
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Agent alerts"
      description="Dangerous actions by AI workloads and agents, from the CloudTrail events AuthSec has received."
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/iga/agent-runtime/containments">Containments</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/iga/agent-runtime/alert-settings">
              <Settings className="size-3.5" aria-hidden="true" />
              Alert settings
            </Link>
          </Button>
        </>
      }
    >
      {caps.state !== "available" ? (
        <NotAvailable caps={caps} what="Agent alerts" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div role="radiogroup" aria-label="State" className="flex items-center gap-1.5">
              {(["", ...STATES] as const).map((s) => (
                <button key={s || "all"} type="button" role="radio" aria-checked={state === s} onClick={() => setState(s)} className={chipButtonClass(state === s)}>
                  {s === "" ? "Any state" : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Severity" className="flex items-center gap-1.5">
              {(["", ...SEVERITIES] as const).map((s) => (
                <button key={s || "all"} type="button" role="radio" aria-checked={severity === s} onClick={() => setSeverity(s)} className={chipButtonClass(severity === s)}>
                  {s === "" ? "Any severity" : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {failure && !list.data ? <ReadFailure failure={failure} subject="alerts" onRetry={() => void list.refetch()} /> : null}
          {!failure || list.data ? (
            <div className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
              <CardContent variant="flush">
                <AdaptiveTable
                  tableId="agent-runtime-alerts"
                  data={list.data?.data ?? []}
                  columns={columns}
                  getRowId={(a) => a.id}
                  enableSelection={false}
                  sizing="fit"
                  loading={list.isLoading}
                  onRowClick={(a) => navigate(`/iga/agent-runtime/alerts/${a.id}`)}
                  emptyState={
                    <p className="py-6 text-center text-sm text-(--color-text-muted)">
                      {state || severity ? "No alerts match these filters." : "No alerts. Alerts open only for events AuthSec has received; see each connection's event stream and coverage."}
                    </p>
                  }
                />
              </CardContent>
            </div>
          ) : null}
          {list.data?.meta.next_cursor ? <p className="text-xs text-(--color-text-muted)">Showing the newest {list.data.data.length}. Use the filters to narrow.</p> : null}
        </>
      )}
    </ConsolePage>
  );
}
