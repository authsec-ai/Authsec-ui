/**
 * EscalationEditor — named escalation configuration form.
 *
 * Shows existing escalation configs from the policy document and allows
 * editing enabled state, approver groups, MFA, TTL, max uses, and self-approval.
 * Each config shows which rules reference it.
 */

import { useState } from "react";
import { Shield, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";
import { StatusBadge } from "@/components/console/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PolicyEscalation, PolicyV2Rule } from "./policyApi";

// ── Props ────────────────────────────────────────────────────────────────────

interface EscalationEditorProps {
  escalations: PolicyEscalation[];
  rules: PolicyV2Rule[];
  readOnly?: boolean;
  onUpdate?: (escalations: PolicyEscalation[]) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MFA_PROVIDERS = [
  { value: "", label: "None" },
  { value: "authnull", label: "AuthNull" },
  { value: "totp", label: "TOTP" },
  { value: "webauthn", label: "WebAuthn" },
] as const;

const MFA_LEVELS = [
  { value: "", label: "Default" },
  { value: "possession", label: "Possession" },
  { value: "biometric", label: "Biometric" },
] as const;

const SELF_APPROVAL_OPTIONS = [
  { value: "deny", label: "Deny" },
  { value: "allow", label: "Allow" },
  { value: "require_mfa", label: "Require MFA" },
] as const;

function getReferencingRules(
  escalationName: string,
  rules: PolicyV2Rule[],
): PolicyV2Rule[] {
  return rules.filter((r) => r.escalation_ref === escalationName);
}

// ── Component ────────────────────────────────────────────────────────────────

export function EscalationEditor({
  escalations,
  rules,
  readOnly = false,
  onUpdate,
}: EscalationEditorProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);

  if (escalations.length === 0) {
    return (
      <Panel title="Escalation Configs">
        <div className="flex items-center gap-2 text-sm text-(--color-text-muted)">
          <Shield className="size-4" />
          <span>No escalation configurations defined in this policy.</span>
        </div>
      </Panel>
    );
  }

  const handleFieldChange = (
    idx: number,
    field: keyof PolicyEscalation,
    value: unknown,
  ) => {
    if (readOnly || !onUpdate) return;
    const updated = escalations.map((esc, i) =>
      i === idx ? { ...esc, [field]: value } : esc,
    );
    onUpdate(updated);
  };

  return (
    <div className="space-y-4">
      {escalations.map((esc, idx) => {
        const refs = getReferencingRules(esc.name, rules);
        const isEditing = editIdx === idx;

        return (
          <Panel
            key={esc.name}
            title={
              <span className="inline-flex items-center gap-2">
                <Shield className="size-4" />
                {esc.name}
                <StatusBadge tone={esc.enabled ? "success" : "neutral"}>
                  {esc.enabled ? "enabled" : "disabled"}
                </StatusBadge>
              </span>
            }
          >
            {!esc.enabled && refs.length > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="size-3.5" />
                <span>
                  This config is disabled but {refs.length} rule
                  {refs.length !== 1 ? "s" : ""} reference it — those rules are
                  invalid.
                </span>
              </div>
            )}

            {isEditing && !readOnly ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min Approvals</Label>
                    <Input
                      type="number"
                      min={1}
                      value={esc.min_approvals ?? 1}
                      onChange={(e) =>
                        handleFieldChange(idx, "min_approvals", parseInt(e.target.value) || 1)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">MFA Provider</Label>
                    <Select
                      value={esc.mfa_provider ?? ""}
                      onValueChange={(v) => handleFieldChange(idx, "mfa_provider", v || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MFA_PROVIDERS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value || "none"}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">MFA Level</Label>
                    <Select
                      value={esc.mfa_level ?? ""}
                      onValueChange={(v) => handleFieldChange(idx, "mfa_level", v || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MFA_LEVELS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value || "default"}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Self Approval</Label>
                    <Select
                      value={esc.self_approval ?? "deny"}
                      onValueChange={(v) => handleFieldChange(idx, "self_approval", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SELF_APPROVAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Max TTL (seconds)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={esc.max_ttl_seconds ?? 0}
                      onChange={(e) =>
                        handleFieldChange(idx, "max_ttl_seconds", parseInt(e.target.value) || 0)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Uses (0 = unlimited)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={esc.max_uses ?? 0}
                      onChange={(e) =>
                        handleFieldChange(idx, "max_uses", parseInt(e.target.value) || 0)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Timeout (seconds)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={esc.timeout_seconds ?? 0}
                      onChange={(e) =>
                        handleFieldChange(idx, "timeout_seconds", parseInt(e.target.value) || 0)
                      }
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditIdx(null)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div>
                <Facts>
                  <Fact label="Approver Groups">
                    {esc.approver_group_ids.length > 0
                      ? esc.approver_group_ids.join(", ")
                      : "None"}
                  </Fact>
                  <Fact label="Min Approvals">{esc.min_approvals ?? 1}</Fact>
                  <Fact label="MFA Provider">{esc.mfa_provider || "None"}</Fact>
                  <Fact label="MFA Level">{esc.mfa_level || "Default"}</Fact>
                  <Fact label="Self Approval">{esc.self_approval || "deny"}</Fact>
                  <Fact label="Max TTL">
                    {esc.max_ttl_seconds ? `${esc.max_ttl_seconds}s` : "Unlimited"}
                  </Fact>
                  <Fact label="Max Uses">{esc.max_uses || "Unlimited"}</Fact>
                  <Fact label="Timeout">
                    {esc.timeout_seconds ? `${esc.timeout_seconds}s` : "None"}
                  </Fact>
                </Facts>

                {refs.length > 0 && (
                  <div className="mt-3 border-t border-(--color-border-subtle) pt-3">
                    <p className="text-xs font-medium text-(--color-text-muted) mb-1">
                      Referenced by {refs.length} rule{refs.length !== 1 ? "s" : ""}:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {refs.map((r) => (
                        <span
                          key={r.id}
                          className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 text-xs font-mono"
                        >
                          {r.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setEditIdx(idx)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
