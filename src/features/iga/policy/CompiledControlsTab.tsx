/**
 * CompiledControlsTab — displays compiled artifacts for a policy revision.
 *
 * Shows artifact metadata (canonical hash, compiler build), groups controls
 * by kind (Landlock, seccomp, network, gateway_broker), and includes a
 * collapsible Rego source viewer when the artifact carries OPA source.
 */

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";
import { StatusBadge } from "@/components/console/status";

import { useGetCompiledArtifactsQuery, type CompiledControl } from "./policyApi";

// ── Kind display names ───────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  filesystem: "Filesystem",
  egress: "Egress",
  exec: "Exec",
  admission: "Admission",
  broker: "Broker",
  landlock: "Landlock",
  seccomp: "Seccomp",
  network: "Network",
  gateway_broker: "Gateway Broker",
};

function EffectBadge({ effect }: { effect?: string }) {
  if (effect === "allow") return <StatusBadge tone="success">Allow</StatusBadge>;
  if (effect === "deny") return <StatusBadge tone="danger">Deny</StatusBadge>;
  if (!effect) return <StatusBadge tone="neutral">Unknown</StatusBadge>;
  return <StatusBadge tone="neutral">{effect}</StatusBadge>;
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CompiledControlsTabProps {
  policyId: string;
  revision: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompiledControlsTab({ policyId, revision }: CompiledControlsTabProps) {
  const { data: artifacts, isLoading, error } = useGetCompiledArtifactsQuery({
    policyId,
    revision,
  });

  const [regoExpanded, setRegoExpanded] = useState(false);

  const controls = artifacts?.controls ?? [];

  // Group controls by kind
  const groupedControls = useMemo(() => {
    const groups = new Map<string, CompiledControl[]>();
    for (const ctrl of controls) {
      const existing = groups.get(ctrl.kind) ?? [];
      existing.push(ctrl);
      groups.set(ctrl.kind, existing);
    }
    return groups;
  }, [controls]);

  const handleCopyRego = useCallback(async () => {
    if (!artifacts?.rego_source) return;
    try {
      await navigator.clipboard.writeText(artifacts.rego_source);
      toast.success("Rego source copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [artifacts?.rego_source]);

  const handleDownloadRego = useCallback(() => {
    if (!artifacts?.rego_source) return;
    const blob = new Blob([artifacts.rego_source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-${policyId}-r${revision}.rego`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifacts?.rego_source, policyId, revision]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Panel title="Compiled Controls">
        <div
          className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)"
          aria-busy="true"
          aria-label="Loading compiled artifacts"
        />
      </Panel>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Panel title="Compiled Controls">
        <p className="text-sm text-(--color-text-muted)">
          Unable to load compiled artifacts. The revision may not have been compiled yet.
        </p>
      </Panel>
    );
  }

  // ── No data ──────────────────────────────────────────────────────────────

  if (!artifacts) {
    return (
      <Panel title="Compiled Controls">
        <p className="text-sm text-(--color-text-muted)">No compiled artifacts available.</p>
      </Panel>
    );
  }

  // ── Normal render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Artifact metadata */}
      <Panel title="Artifact Info">
        <Facts>
          <Fact label="Profile">{artifacts.profile || "Not recorded"}</Fact>
          <Fact label="Schema" mono>{artifacts.schema || artifacts.compiler_build || "Not recorded"}</Fact>
          <Fact label="Content hash" mono>
            {artifacts.canonical_hash || "Not recorded"}
          </Fact>
          <Fact label="Controls">
            {controls.length} control{controls.length !== 1 ? "s" : ""}
          </Fact>
        </Facts>
        {!artifacts.published ? (
          <p className="mt-3 text-sm text-(--color-text-muted)">
            This revision has not been published, so collectors have no compiled controls yet.
          </p>
        ) : null}
      </Panel>

      {/* Controls grouped by kind */}
      {Array.from(groupedControls.entries()).map(([kind, controls]) => (
        <Panel
          key={kind}
          title={kindLabel(kind)}
          count={`${controls.length} control${controls.length !== 1 ? "s" : ""}`}
          flush
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-left text-xs text-(--color-text-muted)">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Effect</th>
                <th className="px-4 py-2 font-medium">Rule ID</th>
                <th className="px-4 py-2 font-medium">Instruction Summary</th>
                <th className="px-4 py-2 font-medium">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((ctrl) => (
                <tr
                  key={`${ctrl.kind}-${ctrl.rule_id}-${ctrl.name}`}
                  className="border-b border-(--color-border-subtle) last:border-b-0"
                >
                  <td className="px-4 py-2 text-xs font-medium">{ctrl.name}</td>
                  <td className="px-4 py-2">
                    <EffectBadge effect={ctrl.status} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-(--color-text-muted)">
                    {ctrl.rule_id || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-(--color-text-muted)">
                    {ctrl.instruction_summary || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-(--color-text-muted)">
                    {ctrl.sha256 ? `${ctrl.sha256.slice(0, 16)}…` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      {/* Empty state for controls */}
      {groupedControls.size === 0 && (
        <Panel title="Controls">
          <p className="text-sm text-(--color-text-muted)">
            No compiled controls in this artifact.
          </p>
        </Panel>
      )}

      {/* Collapsible OPA Rego viewer */}
      {artifacts.rego_source && (
        <Panel title="OPA Rego Source" description="Compiled Rego policy source">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setRegoExpanded(!regoExpanded)}
              className="flex items-center gap-1.5 text-sm font-medium text-(--color-text) hover:text-(--color-primary)"
            >
              {regoExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              {regoExpanded ? "Hide Rego Source" : "Show Rego Source"}
            </button>

            {regoExpanded && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleCopyRego}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleDownloadRego}
                  >
                    <Download className="size-3.5" />
                    Download
                  </Button>
                  <StatusBadge tone="neutral">read-only</StatusBadge>
                </div>

                <div className="max-h-[600px] overflow-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle)">
                  <pre className="text-xs leading-relaxed">
                    {artifacts.rego_source.split("\n").map((line, idx) => (
                      <div key={idx} className="flex hover:bg-(--color-surface-subtle)/80">
                        <span className="w-12 shrink-0 select-none px-2 py-px text-right text-(--color-text-muted) opacity-50">
                          {idx + 1}
                        </span>
                        <code className="flex-1 px-2 py-px whitespace-pre">{line}</code>
                      </div>
                    ))}
                  </pre>
                </div>
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
