/**
 * EvidenceTraceDrawer — side drawer showing the evidence chain for a
 * workload + policy combination.
 *
 * Renders a vertical timeline:
 *   Audit Event -> Observation -> Graph Node -> Policy Rule -> Approval -> Receipt
 *
 * Each node is a connected panel with a left-border line pattern, and each
 * links to its detail page.
 *
 * Part of UI06: Protect Workflow & Rollout Enhancements.
 */

import { X, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";

// ── Evidence chain node types ───────────────────────────────────────────────

type EvidenceNodeKind =
  | "audit_event"
  | "observation"
  | "graph_node"
  | "policy_rule"
  | "approval"
  | "receipt";

interface EvidenceNode {
  kind: EvidenceNodeKind;
  label: string;
  description: string;
  tone: ConsoleTone;
  href: string;
  timestamp?: string;
  meta?: Record<string, string>;
}

const NODE_DISPLAY: Record<EvidenceNodeKind, { title: string; tone: ConsoleTone }> = {
  audit_event: { title: "Audit Event", tone: "info" },
  observation: { title: "Observation", tone: "info" },
  graph_node: { title: "Graph Node", tone: "neutral" },
  policy_rule: { title: "Policy Rule", tone: "warning" },
  approval: { title: "Approval", tone: "success" },
  receipt: { title: "Receipt", tone: "success" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildEvidenceChain(workloadId: string, policyId: string): EvidenceNode[] {
  // The chain is derived from the workload + policy identifiers.
  // In a production implementation the backend would supply the full chain
  // via a dedicated query; here we assemble static references that link to
  // the correct detail routes.
  return [
    {
      kind: "audit_event",
      label: "Audit Event",
      description: `Runtime audit event captured for workload ${workloadId.slice(0, 8)}...`,
      tone: NODE_DISPLAY.audit_event.tone,
      href: `/iga/audit-events?workload=${workloadId}`,
    },
    {
      kind: "observation",
      label: "Observation",
      description: "Behavioral observation derived from audit events.",
      tone: NODE_DISPLAY.observation.tone,
      href: `/iga/observations?workload=${workloadId}`,
    },
    {
      kind: "graph_node",
      label: "Graph Node",
      description: "Identity-graph node linking the workload to its evidence.",
      tone: NODE_DISPLAY.graph_node.tone,
      href: `/iga/graph/workloads/${workloadId}`,
    },
    {
      kind: "policy_rule",
      label: "Policy Rule",
      description: `Rule matched from policy ${policyId.slice(0, 8)}...`,
      tone: NODE_DISPLAY.policy_rule.tone,
      href: `/iga/policies/${policyId}/rules`,
    },
    {
      kind: "approval",
      label: "Approval",
      description: "Approval gate record for policy publication.",
      tone: NODE_DISPLAY.approval.tone,
      href: `/iga/policies/${policyId}/history`,
    },
    {
      kind: "receipt",
      label: "Delivery Receipt",
      description: "Delivery receipt confirming controls are installed on target.",
      tone: NODE_DISPLAY.receipt.tone,
      href: `/iga/policies/${policyId}/deployments`,
    },
  ];
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

interface EvidenceTraceDrawerProps {
  open: boolean;
  onClose: () => void;
  workloadId: string;
  policyId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EvidenceTraceDrawer({
  open,
  onClose,
  workloadId,
  policyId,
}: EvidenceTraceDrawerProps) {
  if (!open) return null;

  const chain = buildEvidenceChain(workloadId, policyId);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-(--color-border-subtle) bg-(--color-surface) shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-(--color-text)">Evidence Trace</h2>
          <p className="mt-0.5 truncate text-xs text-(--color-text-muted)">
            Workload {workloadId.slice(0, 12)}...
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Scrollable timeline body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="relative">
          {chain.map((node, idx) => {
            const isLast = idx === chain.length - 1;

            return (
              <div key={node.kind} className="relative flex gap-3">
                {/* Vertical timeline connector */}
                <div className="flex flex-col items-center">
                  {/* Dot */}
                  <div
                    className={
                      "mt-1 size-2.5 shrink-0 rounded-full " +
                      (node.tone === "success"
                        ? "bg-(--color-success)"
                        : node.tone === "warning"
                          ? "bg-(--color-warning)"
                          : node.tone === "info"
                            ? "bg-(--color-primary)"
                            : "bg-(--color-text-subtle)")
                    }
                  />
                  {/* Line */}
                  {!isLast && (
                    <div className="w-px flex-1 bg-(--color-border-subtle)" />
                  )}
                </div>

                {/* Panel */}
                <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
                  <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={node.tone}>{node.label}</StatusBadge>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-(--color-text-muted)">
                          {node.description}
                        </p>
                        {node.timestamp && (
                          <p className="mt-1 text-[11px] tabular-nums text-(--color-text-muted)">
                            {formatTimestamp(node.timestamp)}
                          </p>
                        )}
                        {node.meta &&
                          Object.entries(node.meta).map(([k, v]) => (
                            <p key={k} className="mt-0.5 text-[11px] text-(--color-text-muted)">
                              <span className="font-medium">{k}:</span>{" "}
                              <span className="font-mono">{v}</span>
                            </p>
                          ))}
                      </div>
                      <Link
                        to={node.href}
                        className="mt-0.5 shrink-0 text-(--color-text-muted) hover:text-(--color-primary)"
                        title={`View ${node.label}`}
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-(--color-border-subtle) px-4 py-3">
        <p className="text-[11px] text-(--color-text-muted)">
          Evidence chain for policy{" "}
          <span className="font-mono">{policyId.slice(0, 8)}...</span> on workload{" "}
          <span className="font-mono">{workloadId.slice(0, 8)}...</span>
        </p>
      </div>
    </div>
  );
}
