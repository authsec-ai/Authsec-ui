/**
 * Provision / deprovision a discovered agent.
 *
 * Claiming records intent; provisioning is what actually binds an identity and
 * creates entitlements. Two rules the form enforces so the DB never has to 400/500:
 *
 *   - expires_at XOR duration — sending both is a 400. The form offers a single
 *     access-window control that produces one or the other, never both.
 *   - Time-boxed is the DEFAULT and standing is the deliberate exception. Choosing
 *     standing access requires a justification (the DB rejects a standing grant
 *     without one), and the form requires it the moment standing is chosen.
 */

import { useMemo, useState } from "react";
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
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { useGetRolesQuery } from "@/app/api/rolesApi";
import type { DiscoveredAgent } from "@/app/api/discoveryApi";
import {
  governanceError,
  useProvisionAgentMutation,
  useDeprovisionAgentMutation,
  type DeprovisionResult,
} from "@/app/api/governanceApi";

type AccessWindow = "duration" | "expires_at" | "standing";

const DURATION_OPTIONS = [
  { value: "24h", label: "24 hours" },
  { value: "168h", label: "7 days" },
  { value: "720h", label: "30 days" },
  { value: "2160h", label: "90 days" },
];

export function ProvisionAgentDialog({
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
  const [resourceServerId, setResourceServerId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [accessWindow, setAccessWindow] = useState<AccessWindow>("duration");
  const [duration, setDuration] = useState("720h");
  const [expiresAt, setExpiresAt] = useState("");
  const [justification, setJustification] = useState("");
  const [purpose, setPurpose] = useState("");

  const [provision, { isLoading: saving }] = useProvisionAgentMutation();
  const { data: resourceServers } = useListResourceServersQuery();
  const { data: roles } = useGetRolesQuery({});

  const rsOptions = useMemo(
    () => (resourceServers ?? []).map((r) => ({ id: r.id, label: r.name })),
    [resourceServers],
  );
  const roleOptions = useMemo(
    () => (roles ?? []).map((r) => ({ id: r.id, label: r.name })),
    [roles],
  );

  const isStanding = accessWindow === "standing";
  const needsJustification = isStanding && !justification.trim();
  const windowValid =
    accessWindow === "standing" ||
    (accessWindow === "duration" && !!duration) ||
    (accessWindow === "expires_at" && !!expiresAt);
  const canSubmit = !!resourceServerId && !!roleId && windowValid && !needsJustification;

  const reset = () => {
    setResourceServerId("");
    setRoleId("");
    setAccessWindow("duration");
    setDuration("720h");
    setExpiresAt("");
    setJustification("");
    setPurpose("");
  };

  const submit = async () => {
    if (!agent || !canSubmit) return;
    try {
      const result = await provision({
        id: agent.id,
        body: {
          resource_server_id: resourceServerId,
          role_id: roleId,
          // expires_at XOR duration — send exactly one, or neither for standing.
          ...(accessWindow === "duration" ? { duration } : {}),
          ...(accessWindow === "expires_at"
            ? { expires_at: new Date(expiresAt).toISOString() }
            : {}),
          ...(isStanding ? { is_standing: true } : {}),
          ...(justification.trim() ? { justification: justification.trim() } : {}),
          ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        },
      }).unwrap();
      toast.success(
        result.is_standing
          ? "Provisioned with standing access."
          : `Provisioned${result.expires_at ? " (time-boxed)" : ""}.`,
      );
      onDone();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not provision the agent."));
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
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Provision access</DialogTitle>
          <DialogDescription>
            Binds an identity and creates entitlements for this agent. Time-boxed access is the
            default; standing access is the audited exception and needs a justification.
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
            <Label htmlFor="pv-rs">Resource server</Label>
            <Select value={resourceServerId} onValueChange={setResourceServerId}>
              <SelectTrigger id="pv-rs">
                <SelectValue placeholder="Select a resource server…" />
              </SelectTrigger>
              <SelectContent>
                {rsOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="pv-role">
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-window">Access window</Label>
            <Select value={accessWindow} onValueChange={(v) => setAccessWindow(v as AccessWindow)}>
              <SelectTrigger id="pv-window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="duration">Expires after a duration</SelectItem>
                <SelectItem value="expires_at">Expires on a date</SelectItem>
                <SelectItem value="standing">Standing (never expires)</SelectItem>
              </SelectContent>
            </Select>

            {accessWindow === "duration" ? (
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {accessWindow === "expires_at" ? (
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            ) : null}

            {isStanding ? (
              <p className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                Standing access never expires and never lands in an access review by expiry. It is
                the exception, not the default — justify it below.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-just">
              Justification{isStanding ? " (required for standing access)" : " (optional)"}
            </Label>
            <Textarea
              id="pv-just"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why this agent needs this access."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pv-purpose">Purpose (optional)</Label>
            <Input
              id="pv-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Short description of what it's for."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!canSubmit || saving}
            onClick={() => void submit()}
          >
            {saving ? "Provisioning…" : "Provision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultLine({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={warn && value > 0 ? "font-semibold text-(--color-danger-text)" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

export function DeprovisionAgentDialog({
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
  const [result, setResult] = useState<DeprovisionResult | null>(null);
  const [deprovision, { isLoading: saving }] = useDeprovisionAgentMutation();

  const reset = () => {
    setReason("");
    setResult(null);
  };

  const submit = async () => {
    if (!agent || !reason.trim()) return;
    try {
      const r = await deprovision({ id: agent.id, body: { reason: reason.trim() } }).unwrap();
      setResult(r);
      onDone();
      if (r.residual_bindings > 0) {
        toast.error(`Deprovisioned, but ${r.residual_bindings} binding(s) were not removed.`, {
          duration: 7000,
        });
      } else {
        toast.success("Access deprovisioned.");
      }
    } catch (err) {
      toast.error(governanceError(err, "Could not deprovision the agent."));
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
          <DialogTitle>Deprovision access</DialogTitle>
          <DialogDescription>
            Removes this agent&apos;s access and closes its provenance, keeping the record. This
            is not the same as deleting the inventory row.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5 rounded-md border px-3 py-2.5">
              <ResultLine label="Tokens revoked" value={result.tokens_revoked} />
              <ResultLine label="Bindings removed" value={result.bindings_removed} />
              <ResultLine label="Registrations revoked" value={result.registrations_revoked} />
              <ResultLine label="Provenance closed" value={result.provenance_closed} />
              <ResultLine
                label="Service accounts disabled"
                value={result.service_accounts_disabled}
              />
              <ResultLine label="Residual bindings" value={result.residual_bindings} warn />
            </div>
            {result.residual_bindings > 0 ? (
              <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
                <strong className="font-medium">
                  {result.residual_bindings} binding(s) were not fully removed.
                </strong>{" "}
                <span className="text-foreground/80">
                  Something still grants this agent access. Investigate before treating it as
                  deprovisioned.
                </span>
              </div>
            ) : result.already_deprovisioned ? (
              <p className="text-xs text-muted-foreground">
                This agent was already deprovisioned — nothing further to remove.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Access fully removed.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Agent</Label>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
                {agent?.display_name || agent?.fingerprint}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dp-reason">Reason</Label>
              <Textarea
                id="dp-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why access is being removed. Recorded on the closed provenance."
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!reason.trim() || saving}
                onClick={() => void submit()}
              >
                {saving ? "Deprovisioning…" : "Deprovision"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
