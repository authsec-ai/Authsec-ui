/**
 * TestPolicyDrawer — decision input form for server-side OPA evaluation.
 *
 * Lets users enter a principal, workload, primitive, resource, and action,
 * then shows the policy decision (allow/deny/require_approval), matched
 * rules, reasons, and any obligations.
 */

import { useState, useCallback } from "react";
import { Play, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

import {
  useTestPolicyMutation,
  type TestPolicyInput,
  type TestPolicyResult,
} from "./policyApi";

// ── Constants ────────────────────────────────────────────────────────────────

const PRIMITIVES = [
  "file.read",
  "file.write",
  "process.harden",
  "process.exec",
  "network.connect",
  "unix_socket.connect",
  "secret.read",
  "llm.invoke",
  "github.operation",
  "device.open",
  "db.operation",
  "remote.session",
] as const;

function decisionTone(decision: string): ConsoleTone {
  switch (decision) {
    case "allow":
      return "success";
    case "deny":
      return "danger";
    case "require_approval":
      return "warning";
    default:
      return "neutral";
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TestPolicyDrawerProps {
  policyId: string;
  open: boolean;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TestPolicyDrawer({
  policyId,
  open,
  onClose,
}: TestPolicyDrawerProps) {
  const [testPolicy, { isLoading }] = useTestPolicyMutation();

  // Form state
  const [principal, setPrincipal] = useState("");
  const [workloadId, setWorkloadId] = useState("");
  const [executionId, setExecutionId] = useState("");
  const [primitive, setPrimitive] = useState<string>("file.read");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");

  // Result
  const [result, setResult] = useState<TestPolicyResult | null>(null);

  const handleTest = useCallback(async () => {
    const input: TestPolicyInput = {
      principal: principal.trim(),
      workload_id: workloadId.trim(),
      execution_id: executionId.trim() || undefined,
      primitive,
      resource: resource.trim(),
      action: action.trim(),
    };

    if (!input.principal || !input.workload_id || !input.resource || !input.action) {
      toast.error("Principal, workload, resource, and action are required.");
      return;
    }

    try {
      const res = await testPolicy({ policyId, input }).unwrap();
      setResult(res);
    } catch {
      toast.error("Policy test failed.");
    }
  }, [policyId, principal, workloadId, executionId, primitive, resource, action, testPolicy]);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-(--color-border-subtle) bg-(--color-surface) shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) px-4 py-3">
        <h2 className="text-sm font-semibold">Test Policy Decision</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input form */}
        <Panel title="Decision Input">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Principal <span className="text-(--color-danger-text)">*</span>
              </Label>
              <Input
                placeholder="spiffe://example.org/workload/..."
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Workload ID <span className="text-(--color-danger-text)">*</span>
              </Label>
              <Input
                placeholder="UUID of the workload"
                value={workloadId}
                onChange={(e) => setWorkloadId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Execution ID</Label>
              <Input
                placeholder="Optional execution ID"
                value={executionId}
                onChange={(e) => setExecutionId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Primitive</Label>
              <Select value={primitive} onValueChange={setPrimitive}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIMITIVES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Resource <span className="text-(--color-danger-text)">*</span>
              </Label>
              <Input
                placeholder="e.g. /etc/passwd or api.github.com"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Action <span className="text-(--color-danger-text)">*</span>
              </Label>
              <Input
                placeholder="e.g. read, write, connect"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
          </div>

          <Button
            size="sm"
            className="mt-4 gap-1.5 w-full"
            onClick={handleTest}
            disabled={isLoading}
          >
            <Play className="size-3.5" />
            {isLoading ? "Evaluating..." : "Evaluate"}
          </Button>
        </Panel>

        {/* Result display */}
        {result && (
          <Panel title="Decision Result">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Decision:</span>
                <StatusBadge tone={decisionTone(result.decision)}>
                  {result.decision}
                </StatusBadge>
              </div>

              {result.matched_rules.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-(--color-text-muted) mb-1">
                    Matched Rules
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.matched_rules.map((ruleId) => (
                      <span
                        key={ruleId}
                        className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 text-xs font-mono"
                      >
                        {ruleId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-(--color-text-muted) mb-1">
                    Reasons
                  </p>
                  <ul className="list-disc list-inside text-xs text-(--color-text-muted) space-y-0.5">
                    {result.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.obligations && result.obligations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-(--color-text-muted) mb-1">
                    Obligations
                  </p>
                  <pre className="rounded-md bg-(--color-surface-subtle) p-2 text-xs overflow-auto max-h-32">
                    {JSON.stringify(result.obligations, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
