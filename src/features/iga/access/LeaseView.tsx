/**
 * LeaseView — shows active lease details with countdown and revoke action
 * (Batch 10, U34).
 *
 * Props: { leaseId: string }
 * Uses Panel/Facts/Fact pattern from the shared identity-graph components.
 */

import { useState, useEffect, useCallback } from "react";
import { Ban } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

import {
  useGetIgaLeaseQuery,
  useRevokeIgaLeaseMutation,
  type LeaseState,
} from "@/app/api/igaAccessApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function leaseStateTone(s: LeaseState): ConsoleTone {
  switch (s) {
    case "issued":
      return "info";
    case "active":
      return "success";
    case "consumed":
      return "neutral";
    case "expired":
      return "neutral";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

const LEASE_STATE_LABELS: Record<LeaseState, string> = {
  issued: "Issued",
  active: "Active",
  consumed: "Consumed",
  expired: "Expired",
  revoked: "Revoked",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Return a human-readable countdown string, e.g. "2h 15m 30s". */
function useCountdown(expiresAt: string): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Expired";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Main component ───────────────────────────────────────────────────────────

export interface LeaseViewProps {
  leaseId: string;
}

export default function LeaseView({ leaseId }: LeaseViewProps) {
  const { data: lease, isLoading, error } = useGetIgaLeaseQuery(leaseId);
  const [revokeLease, { isLoading: revoking }] = useRevokeIgaLeaseMutation();
  const countdown = useCountdown(lease?.expires_at ?? "");

  const canRevoke = lease && (lease.state === "active" || lease.state === "issued");

  const handleRevoke = useCallback(async () => {
    if (!lease) return;
    try {
      await revokeLease({ id: lease.id }).unwrap();
      toast.success("Lease revoked.");
    } catch (err) {
      toast.error(
        `Failed to revoke lease: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [lease, revokeLease]);

  if (isLoading) {
    return (
      <Panel title="Lease">
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading lease...</span>
        </div>
      </Panel>
    );
  }

  if (error || !lease) {
    return (
      <Panel title="Lease">
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-destructive">
            {error ? "Failed to load lease." : "Lease not found."}
          </span>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Lease Details"
      count={lease.id.slice(0, 8)}
      actions={
        canRevoke ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleRevoke}
            disabled={revoking}
          >
            <Ban className="size-3.5" />
            {revoking ? "Revoking..." : "Revoke"}
          </Button>
        ) : undefined
      }
    >
      <Facts>
        <Fact label="State">
          <StatusBadge tone={leaseStateTone(lease.state)}>
            {LEASE_STATE_LABELS[lease.state] ?? lease.state}
          </StatusBadge>
        </Fact>
        <Fact label="Subject" mono>{lease.subject_id}</Fact>
        <Fact label="Resource" mono>{lease.resource_id}</Fact>
        <Fact label="Action" mono>{lease.action}</Fact>
        <Fact label="Not before">{formatTimestamp(lease.not_before)}</Fact>
        <Fact label="Expires at">
          <span>{formatTimestamp(lease.expires_at)}</span>
          {(lease.state === "active" || lease.state === "issued") && (
            <span className="ml-2 text-xs text-muted-foreground">({countdown})</span>
          )}
        </Fact>
        <Fact label="Usage">
          <span className="tabular-nums">{lease.use_count}</span>
          <span className="text-muted-foreground"> / {lease.max_uses === 0 ? "unlimited" : lease.max_uses}</span>
        </Fact>
        <Fact label="Policy revision" mono>{lease.policy_revision}</Fact>
        <Fact label="Request ID" mono>{lease.request_id}</Fact>
        <Fact label="Lease ID" mono>{lease.id}</Fact>
        <Fact label="Created">{formatTimestamp(lease.created_at)}</Fact>
      </Facts>
    </Panel>
  );
}
