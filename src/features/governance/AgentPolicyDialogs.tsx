/**
 * Create an agent policy.
 *
 * A policy is a STANDING instruction, not a button. A reconciler runs every five
 * minutes, works out what every policy implies, compares it to what is true, and
 * closes the gap. So this form authors intent; it never triggers an action.
 *
 * Four constraints the database enforces anyway. The form enforces them first,
 * because learning them from a 400 is a poor experience:
 *
 *   1. discovered_agent_id XOR selector   — exactly one target
 *   2. duration XOR expires_at            — one clock, or none
 *   3. on_expiry 'evict' requires a reason AND a confirmation
 *   4. the confirmation binds to the EXPANSION, not the selector
 *
 * (4) is the subtle one and the reason this form previews matched agents before
 * it will accept a destructive expiry. A confirmation authorises deleting THESE
 * named agents. An agent that starts matching the selector next week is refused
 * rather than deleted under an authorisation nobody gave for it.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useListDiscoveredAgentsQuery, type DiscoveredAgent } from "@/app/api/discoveryApi";
import {
  governanceError,
  useCreateAgentPolicyMutation,
  type CreateAgentPolicyRequest,
} from "@/app/api/governanceApi";

type TargetMode = "agent" | "selector";
type Clock = "none" | "duration" | "expires_at";

const DURATIONS = [
  { value: "24h", label: "24 hours" },
  { value: "168h", label: "7 days" },
  { value: "720h", label: "30 days" },
  { value: "2160h", label: "90 days" },
];

/**
 * revoke is the default deliberately: it is today's behaviour — entitlements
 * lapse, the workload is untouched — so a mis-set expiry costs access rather
 * than a production workload.
 */
const ON_EXPIRY = [
  { value: "revoke", label: "Revoke access", hint: "Entitlements lapse. The workload keeps running." },
  { value: "quarantine", label: "Quarantine", hint: "Contain the agent: cut its network and stop its pods." },
  { value: "evict", label: "Delete the workload", hint: "Destructive. Needs a reason and a confirmation." },
];

export function CreateAgentPolicyDialog({
  open,
  onOpenChange,
  /** Pre-selects a single-agent policy when opened from an agent row. */
  agent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent?: DiscoveredAgent | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>(agent ? "agent" : "selector");
  const [agentId, setAgentId] = useState(agent?.id ?? "");

  // Selector fields, matching models.AgentPolicySelector.
  const [cluster, setCluster] = useState("");
  const [namespace, setNamespace] = useState("");
  const [framework, setFramework] = useState("");

  const [quarantine, setQuarantine] = useState(false);
  const [scopeCeiling, setScopeCeiling] = useState("");

  const [clock, setClock] = useState<Clock>("none");
  const [duration, setDuration] = useState("720h");
  const [expiresAt, setExpiresAt] = useState("");
  const [onExpiry, setOnExpiry] = useState("revoke");

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [create, { isLoading }] = useCreateAgentPolicyMutation();

  // The expansion preview. Only claimed agents can be targeted — an unclaimed
  // sighting has no owner and no entitlements, so there is nothing to narrow.
  const { data: agentsData } = useListDiscoveredAgentsQuery({ limit: 500 });
  const allAgents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const matched = useMemo(() => {
    if (targetMode === "agent") {
      const a = allAgents.find((x: DiscoveredAgent) => x.id === agentId);
      return a ? [a] : [];
    }
    if (!cluster && !namespace && !framework) return [];
    return allAgents.filter((a: DiscoveredAgent) => {
      const md = (a.metadata ?? {}) as Record<string, unknown>;
      const k8s = (md.kubernetes ?? {}) as Record<string, unknown>;
      const cl = (md.cluster ?? {}) as Record<string, unknown>;
      const det = (md.detection ?? {}) as Record<string, unknown>;
      if (cluster && cl.name !== cluster) return false;
      if (namespace && k8s.namespace !== namespace) return false;
      if (framework) {
        const fw = (det.frameworks as string[] | undefined) ?? [];
        if (!fw.includes(framework)) return false;
      }
      return true;
    });
  }, [targetMode, agentId, allAgents, cluster, namespace, framework]);

  const destructive = onExpiry === "evict";
  const hasClock = clock !== "none";

  // A destructive expiry with no clock can never fire — the DB refuses it, and
  // so do we, with a sentence instead of a constraint name.
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("Give the policy a name.");
    if (targetMode === "agent" && !agentId) out.push("Choose an agent to target.");
    if (targetMode === "selector" && !cluster && !namespace && !framework) {
      out.push(
        "A selector needs at least one field. An empty selector would match every agent in the workspace, which is refused.",
      );
    }
    if (destructive && !hasClock) {
      out.push("Deleting on expiry needs an expiry. Set a duration or a date.");
    }
    if (destructive && !reason.trim()) {
      out.push("A destructive expiry needs a reason — it executes unattended.");
    }
    if (destructive && !confirmed) {
      out.push("Confirm the agents this will delete.");
    }
    if (destructive && matched.length === 0) {
      out.push("Nothing matches this target, so there is nothing to confirm.");
    }
    if (clock === "expires_at" && !expiresAt) out.push("Choose an expiry date.");
    return out;
  }, [
    name, targetMode, agentId, cluster, namespace, framework,
    destructive, hasClock, reason, confirmed, matched.length, clock, expiresAt,
  ]);

  const reset = () => {
    setName(""); setDescription(""); setAgentId(agent?.id ?? "");
    setCluster(""); setNamespace(""); setFramework("");
    setQuarantine(false); setScopeCeiling("");
    setClock("none"); setDuration("720h"); setExpiresAt(""); setOnExpiry("revoke");
    setReason(""); setConfirmed(false);
  };

  const submit = async () => {
    if (problems.length > 0) return;

    const body: CreateAgentPolicyRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      desired_state: quarantine ? "quarantined" : "active",
      on_expiry: onExpiry as CreateAgentPolicyRequest["on_expiry"],
    };

    // Exactly one target.
    if (targetMode === "agent") {
      body.discovered_agent_id = agentId;
    } else {
      body.selector = {
        ...(cluster ? { cluster } : {}),
        ...(namespace ? { namespace } : {}),
        ...(framework ? { framework } : {}),
      };
    }

    // One clock, or none. Never both.
    if (clock === "duration") body.duration = duration;
    if (clock === "expires_at") body.expires_at = new Date(expiresAt).toISOString();

    const scopes = scopeCeiling
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (scopes.length > 0) body.scope_ceiling = scopes;

    if (destructive) {
      body.reason = reason.trim();
      // Bind the confirmation to the expansion the operator just saw, not to
      // the selector. This is the whole point of the preview above.
      body.confirm_agent_ids = matched.map((a: DiscoveredAgent) => a.id);
    }

    try {
      await create(body).unwrap();
      toast.success("Policy created. The next sweep will act on it.");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not create the policy."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New agent policy</DialogTitle>
          <DialogDescription>
            A standing instruction. A reconciler compares it against reality every five minutes
            and closes the gap — you are describing an end state, not firing an action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="policy-name">Name</Label>
            <Input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contain the research agents"
            />
          </div>

          {/* ── Target: agent XOR selector ─────────────────────────────── */}
          <div className="space-y-2">
            <Label>Applies to</Label>
            <Select value={targetMode} onValueChange={(v) => setTargetMode(v as TargetMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">One named agent</SelectItem>
                <SelectItem value="selector">Every agent matching a selector</SelectItem>
              </SelectContent>
            </Select>

            {targetMode === "agent" ? (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Choose an agent…" /></SelectTrigger>
                <SelectContent>
                  {allAgents.map((a: DiscoveredAgent) => (
                    <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="Cluster" />
                <Input value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="Namespace" />
                <Input value={framework} onChange={(e) => setFramework(e.target.value)} placeholder="Framework" />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {matched.length === 0
                ? "Matches nothing yet."
                : `Matches ${matched.length} agent${matched.length === 1 ? "" : "s"} right now.`}
            </p>
          </div>

          {/* ── What the policy asks for ───────────────────────────────── */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="policy-quarantine"
                checked={quarantine}
                onCheckedChange={(v) => setQuarantine(v === true)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="policy-quarantine" className="cursor-pointer">Quarantine these agents</Label>
                <p className="text-[11px] text-muted-foreground">
                  Cuts the agent&apos;s network and stops its pods, where the cluster permits it.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-scopes">Scope ceiling (optional)</Label>
              <Input
                id="policy-scopes"
                value={scopeCeiling}
                onChange={(e) => setScopeCeiling(e.target.value)}
                placeholder="read"
              />
              <p className="text-[11px] text-muted-foreground">
                A ceiling, never a grant. Effective access is the intersection of this and what
                was provisioned, so a policy can only ever narrow.
              </p>
            </div>
          </div>

          {/* ── The clock: duration XOR expires_at ─────────────────────── */}
          <div className="space-y-2">
            <Label>Expiry</Label>
            <Select value={clock} onValueChange={(v) => setClock(v as Clock)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Never expires</SelectItem>
                <SelectItem value="duration">After a period</SelectItem>
                <SelectItem value="expires_at">On a date</SelectItem>
              </SelectContent>
            </Select>

            {clock === "duration" ? (
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {clock === "expires_at" ? (
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            ) : null}

            {hasClock ? (
              <div className="space-y-2 pt-1">
                <Label>When it expires</Label>
                <Select value={onExpiry} onValueChange={setOnExpiry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ON_EXPIRY.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {ON_EXPIRY.find((o) => o.value === onExpiry)?.hint}
                </p>
              </div>
            ) : null}
          </div>

          {/* ── Destructive: reason + confirmation bound to the expansion ─ */}
          {destructive ? (
            <div className="space-y-3 rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) p-3">
              <div className="flex items-start gap-2 text-xs text-(--color-danger-text)">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This will delete workloads from the cluster when the policy expires, with nobody
                  present. A warning is sent ahead of the deadline, but the deletion is not
                  conditional on it arriving.
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="policy-reason">Why</Label>
                <Textarea
                  id="policy-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Project decommissioned; workloads must not outlive the engagement."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  You are authorising the deletion of {matched.length} workload
                  {matched.length === 1 ? "" : "s"}:
                </p>
                <ul className="max-h-28 overflow-y-auto rounded border border-border bg-background/60 p-2 text-[11px] text-muted-foreground">
                  {matched.length === 0 ? (
                    <li>Nothing matches this target.</li>
                  ) : (
                    matched.map((a: DiscoveredAgent) => <li key={a.id}>{a.display_name}</li>)
                  )}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  The confirmation binds to <strong>these</strong> agents. An agent that starts
                  matching later is refused rather than deleted under this authorisation.
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="policy-confirm"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor="policy-confirm" className="cursor-pointer text-xs">
                    I authorise deleting the workloads listed above.
                  </Label>
                </div>
              </div>
            </div>
          ) : null}

          {problems.length > 0 ? (
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="text-white"
            onClick={submit}
            disabled={isLoading || problems.length > 0}
          >
            {isLoading ? "Creating…" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
