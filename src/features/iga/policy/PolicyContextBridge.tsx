/**
 * Policy Context Bridge (TRD v1.0 UG04) — opens the policy editor with an
 * unsaved deny proposal derived from a graph selection.
 *
 * Route: /iga/policies/from-graph/:contextId
 *
 * The backend's POST /api/iga/v2/runtime-policies/contexts prepared a context
 * describing what the user selected (workload, identity, edge) and what
 * enforcement is available. This page retrieves that context, shows the
 * "From Identity Graph" source panel, and lets the user save it as a new
 * policy or add a deny rule to an existing one.
 *
 * Save flow:
 *  - New policy: POST /api/iga/v2/runtime-policies (Idempotency-Key)
 *  - Existing policy: PUT /api/iga/v2/runtime-policies/:id/draft (If-Match)
 * Both go through the standard validate -> simulate -> approve -> publish
 * lifecycle afterwards.
 */

import { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, GitBranch, Loader2, Save, Shield } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Panel, Facts, Fact } from "../shared/components/Panel";
import {
  useGetContextQuery,
  useCreatePolicyMutation,
  usePutDraftMutation,
  useGetPolicyQuery,
  type PolicyV2Rule,
  type EnforcementBackend,
  type PolicyContextResponse,
} from "./policyApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDenyDocument(
  name: string,
  rules: PolicyV2Rule[],
  targetWorkloadIds: string[],
  enforcement: EnforcementBackend,
  baseRevision?: number,
) {
  return {
    name,
    format: "authsec.runtime.v1",
    targets: {
      workload_ids: targetWorkloadIds,
      include_future_incarnations: false,
    },
    default_effect: "allow",
    enforcement: {
      backend: enforcement,
      mode: "observe" as const,
    },
    rules,
    required_controls: [],
    evidence_graph_revision: baseRevision ?? 0,
  };
}

// ── Source panel: shows where the proposal came from ─────────────────────────

function SourcePanel({ ctx }: { ctx: PolicyContextResponse }) {
  return (
    <Panel title="From Identity Graph" description="This deny proposal was generated from a graph selection.">
      <Facts>
        <Fact label="Context">{ctx.context_id.slice(0, 12)}...</Fact>
        {ctx.target_workload_ids?.length ? (
          <Fact label="Target workloads">{ctx.target_workload_ids.length} workload{ctx.target_workload_ids.length === 1 ? "" : "s"}</Fact>
        ) : null}
        {ctx.enforcement_backend ? (
          <Fact label="Enforcement backend">{ctx.enforcement_backend}</Fact>
        ) : null}
        {ctx.existing_policy_id ? (
          <Fact label="Existing policy">
            <Link to={`/iga/policies/${ctx.existing_policy_id}`} className="text-sm text-(--color-primary) hover:underline">
              {ctx.existing_policy_id.slice(0, 12)}...
            </Link>
            {ctx.base_revision != null ? ` (revision ${ctx.base_revision})` : ""}
          </Fact>
        ) : (
          <Fact label="Policy">New policy (no existing policy targets this workload)</Fact>
        )}
      </Facts>
    </Panel>
  );
}

// ── Proposed rules panel ─────────────────────────────────────────────────────

function ProposedRulesPanel({ rules }: { rules: PolicyV2Rule[] }) {
  if (!rules.length) {
    return (
      <Panel title="Proposed Rules">
        <p className="text-sm text-(--color-text-muted)">
          No deny rules could be automatically generated from this selection. You can add rules manually after creating the policy.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Proposed Rules" count={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs">
            <span className="rounded bg-(--color-destructive-text)/10 px-1.5 py-0.5 font-semibold text-(--color-destructive-text)">
              {rule.effect}
            </span>
            <span className="font-mono text-(--color-text)">{rule.primitive}</span>
            {rule.resource ? (
              <>
                <span className="text-(--color-text-muted)">on</span>
                <span className="min-w-0 truncate font-mono text-(--color-text)">{rule.resource}</span>
              </>
            ) : null}
            {rule.actions?.length ? (
              <>
                <span className="text-(--color-text-muted)">actions:</span>
                <span className="font-mono text-(--color-text)">{rule.actions.join(", ")}</span>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function PolicyContextBridgePage() {
  const { contextId } = useParams<{ contextId: string }>();
  const navigate = useNavigate();

  const { data: ctx, isLoading: ctxLoading, isError: ctxError } = useGetContextQuery(contextId!, { skip: !contextId });

  // When extending an existing policy, fetch its current state for If-Match.
  const existingId = ctx?.existing_policy_id;
  const { data: existingPolicy } = useGetPolicyQuery(existingId!, { skip: !existingId });

  const [createPolicy, { isLoading: creating }] = useCreatePolicyMutation();
  const [putDraft, { isLoading: drafting }] = usePutDraftMutation();

  const [policyName, setPolicyName] = useState("");
  const saving = creating || drafting;

  // Use the suggested name from context as default.
  const effectiveName = policyName || ctx?.suggested_name || "";

  const proposedRules = useMemo(() => ctx?.proposed_rules ?? [], [ctx]);

  const handleSave = useCallback(async () => {
    if (!ctx) return;

    const targetIds = ctx.target_workload_ids ?? [];
    const enforcement = ctx.enforcement_backend ?? "authsec";
    const rules = proposedRules.length > 0
      ? proposedRules
      : [{
          id: crypto.randomUUID(),
          primitive: "network.connect",
          effect: "deny" as const,
          required: true,
          explanation: "Deny rule from identity graph selection",
        }];

    try {
      if (ctx.existing_policy_id && existingPolicy) {
        // Add deny rule(s) as a new draft revision on the existing policy.
        const etag = existingPolicy.etag;
        const currentRevision = existingPolicy.revisions[existingPolicy.revisions.length - 1];
        let existingDoc: Record<string, unknown> = {};
        try {
          existingDoc = typeof currentRevision?.document === "string"
            ? JSON.parse(currentRevision.document) as Record<string, unknown>
            : (currentRevision?.document as Record<string, unknown>) ?? {};
        } catch {
          // Malformed existing document — start fresh
        }
        const existingRules = Array.isArray(existingDoc.rules) ? existingDoc.rules as PolicyV2Rule[] : [];
        const mergedRules = [...existingRules, ...rules];
        const document = {
          ...existingDoc,
          rules: mergedRules,
          evidence_graph_revision: ctx.base_revision ?? (existingDoc.evidence_graph_revision as number) ?? 0,
        };

        const result = await putDraft({
          id: ctx.existing_policy_id,
          etag,
          document,
        }).unwrap();

        toast.success("Deny rule added to existing policy draft");
        navigate(`/iga/policies/${result.policy_id}`);
      } else {
        // Create a new policy with the deny rule(s).
        const name = effectiveName.trim() || `deny-from-graph-${Date.now()}`;
        const document = buildDenyDocument(name, rules, targetIds, enforcement, ctx.base_revision);

        const result = await createPolicy({ name, document }).unwrap();

        toast.success("Policy created from graph selection");
        navigate(`/iga/policies/${result.policy_id}`);
      }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to save policy";
      toast.error(typeof msg === "string" ? msg : "Failed to save policy");
    }
  }, [ctx, existingPolicy, proposedRules, effectiveName, createPolicy, putDraft, navigate]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (!contextId) {
    return (
      <ConsolePage title="Policy from Graph" description="No context provided.">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
      </ConsolePage>
    );
  }

  if (ctxLoading) {
    return (
      <ConsolePage title="Policy from Graph" description="Loading context...">
        <div className="flex items-center justify-center py-16" role="status" aria-busy="true">
          <Loader2 className="size-8 animate-spin text-(--color-text-muted)" />
        </div>
      </ConsolePage>
    );
  }

  if (ctxError || !ctx) {
    return (
      <ConsolePage
        title="Policy from Graph"
        description="Could not retrieve the policy context."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Error">
          <p className="text-sm text-(--color-text-muted)">
            The policy context could not be loaded. It may have expired or the backend is unavailable.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(-1)}>
            Return to the graph
          </Button>
        </Panel>
      </ConsolePage>
    );
  }

  if (!ctx.publishable) {
    return (
      <ConsolePage
        title="Policy from Graph"
        description="This selection cannot produce a publishable policy."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      >
        <Panel title="Not publishable">
          <p className="text-sm text-(--color-text-muted)">
            {ctx.reason ?? "The selected objects do not support deny enforcement. A baseline policy must be established before a deny rule can be added."}
          </p>
        </Panel>
        <SourcePanel ctx={ctx} />
      </ConsolePage>
    );
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  return (
    <ConsolePage
      title={
        <span className="inline-flex items-center gap-2">
          <Shield className="size-5 text-(--color-text-muted)" />
          {ctx.existing_policy_id ? "Add Deny Rule to Policy" : "Create Deny Policy"}
        </span>
      }
      description={
        ctx.existing_policy_id
          ? "Add a deny rule from the identity graph to an existing policy draft."
          : "Create a new runtime policy with a deny rule derived from the identity graph."
      }
      actions={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back to graph
        </Button>
      }
    >
      <SourcePanel ctx={ctx} />

      <ProposedRulesPanel rules={proposedRules} />

      {!ctx.existing_policy_id ? (
        <Panel title="Policy Details">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ctx-policy-name">
                Policy name <span className="text-(--color-destructive-text)">*</span>
              </Label>
              <Input
                id="ctx-policy-name"
                placeholder={ctx.suggested_name ?? "e.g. deny-workload-external-access"}
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {ctx.existing_policy_id && existingPolicy ? (
        <Panel title="Existing Policy">
          <Facts>
            <Fact label="Name">{existingPolicy.policy.name}</Fact>
            <Fact label="Lifecycle">{existingPolicy.policy.lifecycle}</Fact>
            <Fact label="Current revision">v{existingPolicy.policy.current_draft_revision}</Fact>
          </Facts>
          <p className="mt-3 text-xs text-(--color-text-muted)">
            The deny rule will be added as a new draft revision, preserving existing rules.
          </p>
        </Panel>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 size-4" />
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          disabled={saving || (!ctx.existing_policy_id && !effectiveName.trim())}
          className="gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : ctx.existing_policy_id ? (
            <>
              <GitBranch className="size-4" />
              Add Deny Rule
            </>
          ) : (
            <>
              <Save className="size-4" />
              Create Policy
            </>
          )}
        </Button>
      </div>
    </ConsolePage>
  );
}

export default PolicyContextBridgePage;
