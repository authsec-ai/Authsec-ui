/**
 * Tool policies: list in evaluation order (priority, then name), create, edit
 * (PUT with the version the row was read at), delete with confirm, and the
 * Evaluate tester. agent_gateway_controller.go:305-400. Reads governance:read,
 * changes governance:enforce plus a verified member session.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import { useDeleteToolPolicyMutation, useListToolPoliciesQuery, type ToolPolicy } from "@/app/api/igaAgentGatewayApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/features/iga/shared/components/Panel";
import { usePolicyPermission } from "../../policy/shared";

import { classifyAr } from "../model";
import { ActionError, ReadFailure } from "../parts";
import { EvaluatePanel } from "./EvaluatePanel";
import { EFFECT_TONE, KIND_TEXT, conditionSummary, subjectSummary, targetSummary } from "./gatewayModel";
import { PolicyFormDialog } from "./PolicyForm";
import { useGwAction } from "./useGwAction";

function DeleteDialog({ policy, onClose }: { policy: ToolPolicy; onClose: () => void }) {
  const [del] = useDeleteToolPolicyMutation();
  const act = useGwAction();
  const go = async () => {
    const ok = await act.run(() => del({ id: policy.id }));
    if (ok !== undefined) {
      toast.success("Policy deleted.");
      onClose();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {policy.name}?</DialogTitle>
          <DialogDescription>
            Gateways stop applying it within seconds. {policy.effect === "deny" ? "Calls it denied fall back to the other policies and the workspace mode." : "Calls it allowed fall back to the other policies and the workspace mode, which may deny them."} To pause it instead, edit it and turn Enabled off.
          </DialogDescription>
        </DialogHeader>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant="destructive" className="text-white" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Deleting…" : "Delete policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PoliciesTab({ ws }: { ws: string }) {
  const q = useListToolPoliciesQuery({ ws });
  const { offered } = usePolicyPermission("governance:enforce");
  const [editing, setEditing] = useState<ToolPolicy | "new" | null>(null);
  const [deleting, setDeleting] = useState<ToolPolicy | null>(null);
  const failure = classifyAr(q.error);
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Tool policies"
        count={q.data ? `${rows.length}` : undefined}
        description="Read in this order. A matching deny wins; then the first matching allow; then the workspace mode decides what is left."
        actions={
          offered ? (
            <Button className="text-white" size="sm" onClick={() => setEditing("new")}>
              New policy
            </Button>
          ) : undefined
        }
      >
        {failure && !q.data ? <ReadFailure failure={failure} subject="tool policies" onRetry={() => void q.refetch()} /> : null}
        {q.isLoading ? <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading policies" /> : null}
        {q.data && rows.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">No tool policy. Until you write one, the workspace mode decides every call.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-(--color-border-subtle)">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{p.name}</span>
                    <StatusBadge tone={EFFECT_TONE[p.effect]}>{p.effect === "allow" ? "Allow" : "Deny"}</StatusBadge>
                    <StatusBadge>{KIND_TEXT[p.kind]}</StatusBadge>
                    {!p.enabled ? <StatusBadge tone="warning">Disabled</StatusBadge> : null}
                    <span className="text-xs text-(--color-text-muted)">priority {p.priority}</span>
                  </div>
                  <p className="text-xs text-(--color-text-secondary)">
                    {subjectSummary(p)} → {targetSummary(p)}
                  </p>
                  {conditionSummary(p) ? <p className="text-xs text-(--color-text-muted)">{conditionSummary(p)}</p> : null}
                  {p.description ? <p className="text-xs text-(--color-text-muted)">{p.description}</p> : null}
                </div>
                {offered ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(p)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <EvaluatePanel />
      {editing ? <PolicyFormDialog key={editing === "new" ? "new" : `${editing.id}:${editing.version}`} open policy={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? <DeleteDialog policy={deleting} onClose={() => setDeleting(null)} /> : null}
    </div>
  );
}
