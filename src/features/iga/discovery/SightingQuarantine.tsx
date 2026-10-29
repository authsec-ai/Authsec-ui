/**
 * A sighting's Quarantine panel: quarantine with a reason, or release, and
 * where enforcement stands (quarantineModel.ts). The server decides who may
 * (discovery:quarantine) and audits both; the cluster's agent applies the
 * NetworkPolicy once enforcement is on for its connection.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { useQuarantineAgentMutation, useUnquarantineAgentMutation, type DiscoveredAgent } from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";
import { quarantineErrorText, quarantineView } from "./quarantineModel";

const TONE = { danger: "text-(--color-danger-text)", warning: "text-(--color-warning-text)", muted: "text-(--color-text-muted)" };

export function SightingQuarantine({ agent }: { agent: DiscoveredAgent }) {
  const [quarantine, q] = useQuarantineAgentMutation();
  const [release, r] = useUnquarantineAgentMutation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const v = quarantineView(agent);

  const submit = async () => {
    setError(null);
    try {
      if (v.quarantined) await release({ id: agent.id }).unwrap();
      else await quarantine({ id: agent.id, reason: reason.trim() }).unwrap();
      setOpen(false);
      setReason("");
    } catch (e) {
      setError(quarantineErrorText((e as { status?: number }).status, v.quarantined));
    }
  };

  return (
    <Panel
      title="Quarantine"
      actions={
        <Button size="sm" variant={v.quarantined ? "outline" : "destructive"} onClick={() => setOpen(true)}>
          {v.quarantined ? "Release" : "Quarantine"}
        </Button>
      }
    >
      <p className={`text-[13px] ${TONE[v.tone]}`}>{v.line}</p>
      {v.quarantined ? (
        <Facts className="mt-3">
          <Fact label="Reason">{agent.quarantine_reason || "Not stated"}</Fact>
          <Fact label="Decided">
            <Timestamp iso={agent.quarantined_at} />
          </Fact>
          <Fact label="Blocked in the cluster">
            <Timestamp iso={agent.quarantine_enforced_at} missing="Not yet" />
          </Fact>
        </Facts>
      ) : null}
      {v.enforceable && agent.discovery_source_id ? (
        <p className="mt-3 text-xs text-(--color-text-muted)">
          Needs enforcement on for its cluster:{" "}
          <Link to={`/iga/connections/${encodeURIComponent(agent.discovery_source_id)}/enforcement`} className="text-(--color-primary-text) hover:underline">
            the connection's Enforcement tab
          </Link>
          .
        </p>
      ) : null}
      {error && !open ? <p className="mt-3 text-xs text-(--color-danger-text)">{error}</p> : null}

      <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{v.quarantined ? `Release ${agent.display_name}?` : `Quarantine ${agent.display_name}?`}</DialogTitle>
            <DialogDescription>
              {v.quarantined
                ? "The cluster's agent removes the NetworkPolicy and the workload gets its network back. The quarantine stays in its history."
                : v.enforceable
                  ? "The cluster's agent puts a NetworkPolicy on this workload that cuts its network. The decision and its reason are audited."
                  : "The decision and its reason are recorded and audited. Nothing in a cluster is changed."}
            </DialogDescription>
          </DialogHeader>
          {!v.quarantined ? (
            <div className="space-y-1">
              <Label htmlFor="q-reason" className="text-xs">
                Reason
              </Label>
              <Textarea id="q-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this agent is untrusted" rows={3} />
            </div>
          ) : null}
          {error ? <p className="text-xs text-(--color-danger-text)">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={v.quarantined ? "default" : "destructive"}
              disabled={q.isLoading || r.isLoading || (!v.quarantined && !reason.trim())}
              onClick={() => void submit()}
            >
              {v.quarantined ? "Release" : "Quarantine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
