/**
 * PolicyCreate — multi-step wizard for creating a new runtime policy.
 *
 * Three steps (Details -> Rules -> Review), managed via local state.
 * Follows the ConsolePage + wizard pattern used across the console.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Plus, Save, Sparkles, PenLine } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useCreatePolicyMutation,
  type EnforcementBackend,
  type EnforcementMode,
} from "./policyApi";
import { CandidateGenerationPanel } from "./CandidateGenerationPanel";

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Details", "Rules", "Review"] as const;

const ACTION_OPTIONS = [
  { value: "network.connect", label: "network.connect" },
  { value: "file.read", label: "file.read" },
  { value: "file.write", label: "file.write" },
  { value: "exec", label: "exec" },
  { value: "secret.read", label: "secret.read" },
  { value: "admission", label: "admission" },
] as const;

const EFFECT_OPTIONS = [
  { value: "allow", label: "Allow" },
  { value: "deny", label: "Deny" },
  { value: "require_approval", label: "Require Approval" },
] as const;

// ── Rule source type ──────────────────────────────────────────────────────────

type RuleSource = "manual" | "discovery";

// ── Rule type ─────────────────────────────────────────────────────────────────

interface Rule {
  action: string;
  resource: string;
  effect: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PolicyCreatePage() {
  const navigate = useNavigate();
  const [createPolicy, { isLoading }] = useCreatePolicyMutation();

  // Wizard state
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [backend, setBackend] = useState<EnforcementBackend>("authsec");
  const [enforcementMode, setEnforcementMode] = useState<EnforcementMode>("observe");
  const [profile, setProfile] = useState("");
  const [ruleSource, setRuleSource] = useState<RuleSource>("manual");
  const [rules, setRules] = useState<Rule[]>([
    { action: "network.connect", resource: "", effect: "allow" },
  ]);

  // ── Rule helpers ────────────────────────────────────────────────────────────

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { action: "network.connect", resource: "", effect: "allow" },
    ]);
  };

  const updateRule = (index: number, field: keyof Rule, value: string) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)),
    );
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return ruleSource === "discovery" || rules.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !name.trim()) {
      toast.error("Policy name is required");
      return;
    }
    if (step < STEP_LABELS.length - 1) {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      navigate("/iga/policies");
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const document = {
      description,
      enforcement: {
        backend,
        mode: enforcementMode,
        ...(profile ? { profile } : {}),
      },
      rules: rules.map(({ action, resource, effect }) => ({
        action,
        resource,
        effect,
      })),
    };

    try {
      const result = await createPolicy({ name, document }).unwrap();
      toast.success("Policy created successfully");
      navigate(`/iga/policies/${result.policy_id}`);
    } catch (err: any) {
      const msg =
        err?.data?.error ?? err?.message ?? "Failed to create policy";
      toast.error(typeof msg === "string" ? msg : "Failed to create policy");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ConsolePage
      title="Create Runtime Policy"
      description="Define rules that govern runtime workload behaviour."
    >
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold " +
                (i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground")
              }
            >
              {i + 1}
            </div>
            <span
              className={
                "text-sm font-medium " +
                (i === step ? "text-foreground" : "text-muted-foreground")
              }
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <span className="text-muted-foreground mx-1">—</span>
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Details */}
      {step === 0 && (
        <div className="rounded-lg border bg-card p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="policy-name">
              Policy name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="policy-name"
              placeholder="e.g. production-network-lockdown"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-description">Description</Label>
            <Textarea
              id="policy-description"
              placeholder="Optional — describe what this policy enforces"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* V2: Backend & enforcement mode */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Enforcement Backend</Label>
              <Select
                value={backend}
                onValueChange={(v) => setBackend(v as EnforcementBackend)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authsec">AuthSec</SelectItem>
                  <SelectItem value="openshell">OpenShell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Enforcement Mode</Label>
              <Select
                value={enforcementMode}
                onValueChange={(v) => setEnforcementMode(v as EnforcementMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observe">Observe</SelectItem>
                  <SelectItem value="shadow">Shadow</SelectItem>
                  <SelectItem value="enforce">Enforce</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profile</Label>
              <Input
                placeholder="e.g. linux-managed-v1"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — Rules */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Rule source selector */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRuleSource("manual")}
              className={
                "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors " +
                (ruleSource === "manual"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50")
              }
            >
              <PenLine className="size-4" />
              Define Rules Manually
            </button>
            <button
              type="button"
              onClick={() => setRuleSource("discovery")}
              className={
                "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors " +
                (ruleSource === "discovery"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50")
              }
            >
              <Sparkles className="size-4" />
              Generate from Discovery
            </button>
          </div>

          {/* Manual rule definition */}
          {ruleSource === "manual" && (
            <div className="rounded-lg border bg-card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Rules ({rules.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addRule}
                >
                  <Plus className="size-4" />
                  Add rule
                </Button>
              </div>

              <div className="space-y-4">
                {rules.map((rule, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    {/* Action */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Action</Label>
                      <Select
                        value={rule.action}
                        onValueChange={(v) => updateRule(index, "action", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Resource */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Resource</Label>
                      <Input
                        placeholder="e.g. *.internal:443"
                        value={rule.resource}
                        onChange={(e) =>
                          updateRule(index, "resource", e.target.value)
                        }
                      />
                    </div>

                    {/* Effect */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Effect</Label>
                      <Select
                        value={rule.effect}
                        onValueChange={(v) => updateRule(index, "effect", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EFFECT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Remove */}
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeRule(index)}
                        disabled={rules.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discovery-based generation */}
          {ruleSource === "discovery" && (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate policy rules automatically from discovery evidence.
                After triggering generation, a draft policy will be created
                with rules derived from observed workload behaviour.
              </p>
              <CandidateGenerationPanel policyId="" />
            </div>
          )}
        </div>
      )}

      {/* Step 2 — Review */}
      {step === 2 && (
        <div className="rounded-lg border bg-card p-6 space-y-5">
          <h3 className="text-sm font-semibold">Review</h3>

          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div>
              <h4 className="font-medium text-xs mb-0.5">Policy Name</h4>
              <p className="text-sm">{name}</p>
            </div>

            {description && (
              <div className="border-t pt-3">
                <h4 className="font-medium text-xs mb-0.5">Description</h4>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            )}

            <div className="border-t pt-3">
              <h4 className="font-medium text-xs mb-1">Enforcement</h4>
              <div className="flex gap-4 text-xs">
                <span>
                  Backend: <strong>{backend}</strong>
                </span>
                <span>
                  Mode: <strong>{enforcementMode}</strong>
                </span>
                {profile && (
                  <span>
                    Profile: <strong>{profile}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="font-medium text-xs mb-1">
                Rules ({rules.length})
              </h4>
              <div className="space-y-2">
                {rules.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="font-mono rounded bg-muted px-1.5 py-0.5">
                      {rule.action}
                    </span>
                    <span className="text-muted-foreground">on</span>
                    <span className="font-mono text-foreground">
                      {rule.resource || "(any)"}
                    </span>
                    <span className="text-muted-foreground">-&gt;</span>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 font-medium " +
                        (rule.effect === "allow"
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : rule.effect === "deny"
                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300")
                      }
                    >
                      {rule.effect}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step > 0 ? "Back" : "Cancel"}
        </Button>

        <span className="text-xs text-muted-foreground">
          Step {step + 1} of {STEP_LABELS.length}
        </span>

        {step < STEP_LABELS.length - 1 ? (
          <Button onClick={handleNext} disabled={!canNext()}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => void handleCreate()}
            disabled={isLoading || !canNext()}
          >
            {isLoading ? (
              "Creating..."
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Create Policy
              </>
            )}
          </Button>
        )}
      </div>
    </ConsolePage>
  );
}

export default PolicyCreatePage;
