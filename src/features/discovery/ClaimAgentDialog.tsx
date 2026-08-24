/**
 * Claim / quarantine a discovered agent.
 *
 * Claim is the governance decision that turns a sighting into a governed
 * principal. Both an identity and an owner are mandatory — a DB CHECK
 * (`discovered_agents_registered_chk`) forbids a registered agent without both,
 * so a partial claim cannot be persisted even if the UI let you try.
 *
 * Quarantine is the alternative: the agent stays visible and flagged, and can
 * no longer be claimed.
 *
 * Classify is neither: it corrects what discovery inferred (origin, archetype)
 * without moving the agent's status. A collector guesses these from workload
 * shape and is regularly wrong, so an operator needs to be able to say so.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { useListMembersQuery } from "@/app/api/membershipApi";
import { resolveWorkspaceId } from "@/utils/workspace";
import {
  ARCHETYPE_LABELS,
  ORIGIN_LABELS,
  STATUS_LABELS,
  useClaimAgentMutation,
  useQuarantineAgentMutation,
  useUnquarantineAgentMutation,
  useDeleteDiscoveredAgentMutation,
  useUpdateDiscoveredAgentMutation,
  type AgentArchetype,
  type DeploymentOrigin,
  type DiscoveredAgent,
} from "@/app/api/discoveryApi";

function errorMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) return "Your role is missing the required discovery permission.";
  if (status === 409) return "This agent's status has already moved on. Reload and try again.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}

export function ClaimAgentDialog({
  agent,
  open,
  onOpenChange,
  onDone,
}: {
  agent: DiscoveredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [archetype, setArchetype] = useState<Exclude<AgentArchetype, "">>("autonomous");
  const [claim, { isLoading: saving }] = useClaimAgentMutation();

  const workspaceId = useMemo(() => {
    try {
      return resolveWorkspaceId() ?? "";
    } catch {
      return "";
    }
  }, []);

  const { data: clients } = useListWorkspaceClientsQuery();
  // Workspace members, not end users: the accountable owner of an agent is
  // someone on the team, not a consumer of the tenant's applications.
  const { data: members } = useListMembersQuery(
    { workspaceId, status: "active" },
    { skip: !workspaceId },
  );

  // Agent-kind clients only: a human_app or cli client is not a thing an agent
  // authenticates as, so offering them would only invite a wrong binding.
  const clientOptions = useMemo(
    () =>
      (clients ?? [])
        .filter((c) => c.client_kind === "agent")
        .map((c) => ({ id: c.id, label: c.client_name || c.client_id, sub: c.client_id })),
    [clients],
  );
  // ListMembers decorates each row with the joined user via
  // `u.email AS user_email, u.name AS user_name`. Prefer those: picking an
  // accountable owner off a list of raw uuids is not a choice anyone can make.
  const userOptions = useMemo(
    () =>
      (members?.items ?? []).map((m) => ({
        id: m.user_id,
        label: m.user_name || m.user_email || m.user_username || m.user_id,
        sub: m.user_name ? m.user_email : undefined,
      })),
    [members],
  );

  const reset = () => {
    setClientId("");
    setOwnerId("");
    setArchetype("autonomous");
  };

  const submit = async () => {
    if (!agent || !clientId || !ownerId) return;
    try {
      await claim({
        id: agent.id,
        matched_client_id: clientId,
        owner_user_id: ownerId,
        archetype,
      }).unwrap();
      toast.success(`${agent.display_name || agent.fingerprint} is now governed.`);
      onDone();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not claim the agent."));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim agent</DialogTitle>
          <DialogDescription>
            Binds this sighting to a governed identity and an accountable human. Both are
            required — a registered agent can never be ownerless.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Agent</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {agent?.display_name || agent?.fingerprint}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim-client">Governed identity</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="claim-client">
                <SelectValue placeholder="Select an agent OAuth client…" />
              </SelectTrigger>
              <SelectContent>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span>{c.label}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {c.sub}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {clientOptions.length === 0
                ? "No agent-kind OAuth clients in this workspace yet — register one first."
                : "Every token and action this agent takes will trace to this identity."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim-owner">Accountable owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="claim-owner">
                <SelectValue placeholder="Select a person…" />
              </SelectTrigger>
              <SelectContent>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span>{u.label}</span>
                    {u.sub ? (
                      <span className="ml-2 text-[10px] text-muted-foreground">{u.sub}</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The default approver and certifier for this agent's access.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim-archetype">Authority source</Label>
            <Select
              value={archetype}
              onValueChange={(v) => setArchetype(v as Exclude<AgentArchetype, "">)}
            >
              <SelectTrigger id="claim-archetype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autonomous">{ARCHETYPE_LABELS.autonomous}</SelectItem>
                <SelectItem value="user_delegated">
                  {ARCHETYPE_LABELS.user_delegated}
                </SelectItem>
                <SelectItem value="hybrid">{ARCHETYPE_LABELS.hybrid}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Autonomous agents hold their own entitlements and are capped by them. A
              user-delegated agent borrows a scoped slice of a person's authority and can
              never exceed the delegating user.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!clientId || !ownerId || saving}
            onClick={() => void submit()}
          >
            {saving ? "Claiming…" : "Claim agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuarantineAgentDialog({
  agent,
  open,
  onOpenChange,
  onDone,
}: {
  agent: DiscoveredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [quarantine, { isLoading: saving }] = useQuarantineAgentMutation();

  const submit = async () => {
    if (!agent || !reason.trim()) return;
    try {
      await quarantine({ id: agent.id, reason: reason.trim() }).unwrap();
      toast.success(`${agent.display_name || agent.fingerprint} quarantined.`);
      onDone();
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not quarantine the agent."));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quarantine agent</DialogTitle>
          <DialogDescription>
            Flags this agent as untrusted and blocks it from being claimed. The inventory
            row stays, so the history is preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Agent</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {agent?.display_name || agent?.fingerprint}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-reason">Reason</Label>
            <Textarea
              id="q-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Unrecognised workload in the payments namespace; owner unknown."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Recorded against the agent and shown to whoever reviews it next. Required.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || saving}
            onClick={() => void submit()}
          >
            {saving ? "Quarantining…" : "Quarantine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Release a quarantine. No request body. Same permission as quarantine, on
 * purpose. The resulting status is DERIVED by the backend and returned in the
 * response — we render what came back rather than predicting it, because an
 * agent whose owner was deleted correctly comes back `unregistered`, not
 * `registered`. A release may commit without being enforced (no actuation agent
 * in the cluster); `quarantine_enforcement_error` then carries the kubectl to
 * remove the leftover policy, and we surface it.
 */
export function UnquarantineAgentDialog({
  agent,
  open,
  onOpenChange,
  onDone,
}: {
  agent: DiscoveredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [unquarantine, { isLoading: saving }] = useUnquarantineAgentMutation();

  const submit = async () => {
    if (!agent) return;
    try {
      const result = await unquarantine({ id: agent.id }).unwrap();
      const label = agent.display_name || agent.fingerprint;
      if (result.quarantine_enforcement_error) {
        // The decision committed, but the leftover NetworkPolicy could not be
        // removed. Fails CLOSED: the agent is still blocked. Surface it loudly.
        toast.error(
          `${label} released, but the block is still in place — no actuation agent could remove the policy. Check the agent detail for the kubectl to run.`,
          { duration: 8000 },
        );
      } else {
        toast.success(`${label} released — now ${STATUS_LABELS[result.status]}.`);
      }
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not release the quarantine."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release quarantine</DialogTitle>
          <DialogDescription>
            Lifts the network block. The agent returns to a status the backend derives — if it
            still has both an identity and an owner it becomes registered; otherwise it needs a
            fresh claim decision. The quarantine history is kept as a record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Agent</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {agent?.display_name || agent?.fingerprint}
            </div>
          </div>
          {agent?.quarantine_reason ? (
            <p className="text-xs text-muted-foreground">
              Quarantined for: <span className="text-foreground">{agent.quarantine_reason}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Releasing…" : "Release quarantine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Delete the inventory row. This is a CLEANUP tool for bad data, not lifecycle
 * management — deleting destroys the audit trail, whereas deprovisioning removes
 * access and keeps the record. If an agent is genuinely gone, `runtime_status:
 * "gone"` already says so and the row is the evidence it existed. Guarded by a
 * typed confirmation because it is almost never what a user wants.
 */
export function DeleteAgentDialog({
  agent,
  open,
  onOpenChange,
  onDone,
}: {
  agent: DiscoveredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [remove, { isLoading: saving }] = useDeleteDiscoveredAgentMutation();
  const CONFIRM_WORD = "DELETE";

  useEffect(() => {
    if (!open) setConfirm("");
  }, [open]);

  const submit = async () => {
    if (!agent || confirm !== CONFIRM_WORD) return;
    try {
      await remove(agent.id).unwrap();
      toast.success(`Inventory row for ${agent.display_name || agent.fingerprint} deleted.`);
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the inventory row."));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirm("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete inventory row</DialogTitle>
          <DialogDescription>
            This destroys the audit trail for this agent. It is not the same as deprovisioning —
            deprovision removes access and keeps the record. Use this only to clean up a bad or
            duplicate row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
            <strong className="font-medium">There is no undo.</strong>{" "}
            <span className="text-foreground/80">
              If the agent is gone, its runtime status already records that and the row is the
              evidence it ever existed. Deleting it removes that evidence.
            </span>
          </div>
          <div className="space-y-1">
            <Label>Agent</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {agent?.display_name || agent?.fingerprint}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="del-confirm">
              Type <span className="font-mono">{CONFIRM_WORD}</span> to confirm
            </Label>
            <Input
              id="del-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={confirm !== CONFIRM_WORD || saving}
            onClick={() => void submit()}
          >
            {saving ? "Deleting…" : "Delete row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Correct what discovery inferred about an agent. Backed by
 * PUT /authsec/discovery/agents/:id, whose fields are all pointers server-side,
 * so sending only what changed leaves the rest untouched.
 */
export function ClassifyAgentDialog({
  agent,
  open,
  onOpenChange,
  onDone,
}: {
  agent: DiscoveredAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [origin, setOrigin] = useState<DeploymentOrigin | "">("");
  const [archetype, setArchetype] = useState<Exclude<AgentArchetype, ""> | "">("");
  const [update, { isLoading: saving }] = useUpdateDiscoveredAgentMutation();

  // Seed from the agent each time the dialog opens, so the selects show what is
  // currently recorded rather than an empty form the operator has to re-derive.
  useEffect(() => {
    if (!open || !agent) return;
    setOrigin(agent.deployment_origin);
    setArchetype(agent.archetype === "" ? "" : agent.archetype);
  }, [open, agent]);

  const originChanged = agent != null && origin !== "" && origin !== agent.deployment_origin;
  const archetypeChanged = agent != null && archetype !== "" && archetype !== agent.archetype;
  const dirty = originChanged || archetypeChanged;

  const submit = async () => {
    if (!agent || !dirty) return;
    try {
      await update({
        id: agent.id,
        ...(originChanged ? { deployment_origin: origin as DeploymentOrigin } : {}),
        ...(archetypeChanged
          ? { archetype: archetype as Exclude<AgentArchetype, ""> }
          : {}),
      }).unwrap();
      toast.success(`${agent.display_name || agent.fingerprint} reclassified.`);
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update the agent."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct classification</DialogTitle>
          <DialogDescription>
            Discovery infers these from workload shape and is regularly wrong. Correcting
            them does not change the agent's status — claim and quarantine stay separate
            decisions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Agent</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {agent?.display_name || agent?.fingerprint}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cls-origin">Deployment origin</Label>
            <Select value={origin} onValueChange={(v) => setOrigin(v as DeploymentOrigin)}>
              <SelectTrigger id="cls-origin">
                <SelectValue placeholder="Select an origin…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ORIGIN_LABELS) as DeploymentOrigin[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ORIGIN_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Whether a person stood this agent up by hand or a pipeline created it.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cls-archetype">Archetype</Label>
            <Select
              value={archetype}
              onValueChange={(v) => setArchetype(v as Exclude<AgentArchetype, "">)}
            >
              <SelectTrigger id="cls-archetype">
                <SelectValue placeholder="Select an archetype…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autonomous">{ARCHETYPE_LABELS.autonomous}</SelectItem>
                <SelectItem value="user_delegated">
                  {ARCHETYPE_LABELS.user_delegated}
                </SelectItem>
                <SelectItem value="hybrid">{ARCHETYPE_LABELS.hybrid}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A user-delegated agent borrows a scoped slice of a person's authority and can
              never exceed the delegating user.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!dirty || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
