import { useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Layers,
  List,
  Loader2,
  Monitor,
  MoreHorizontal,
  Terminal,
  Users,
  X,
} from "lucide-react";
import type { Row } from "@tanstack/react-table";

import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
} from "@/components/console/iam-console";
import { EntityCell } from "@/components/console/iam-console";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  useApproveWorkspaceClientMutation,
  useListWorkspaceClientsQuery,
  useRevokeWorkspaceClientMutation,
  type WorkspaceClientItem,
} from "@/app/api/mcpClientsApi";

// ─── Scope ───────────────────────────────────────────────────────────────────

export type ClientsTableScope =
  | { kind: "workspace" }
  | { kind: "resource_server"; rsId: string };

interface ClientsTableProps {
  scope: ClientsTableScope;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (status: StatusFilter) => void;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type KindFilter = "all" | "agent" | "human_app" | "m2m" | "cli";
export type StatusFilter = "all" | "pending_approval" | "approved" | "revoked";
type ViewMode = "flat" | "grouped";

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agents" },
  { key: "human_app", label: "Human apps" },
  { key: "m2m", label: "M2M" },
  { key: "cli", label: "CLI" },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "approved", label: "Approved" },
  { key: "revoked", label: "Revoked" },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

const KIND_STYLES: Record<
  WorkspaceClientItem["client_kind"],
  { chip: string; text: string; icon: React.ComponentType<{ className?: string }> }
> = {
  agent: {
    chip: "border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]",
    text: "text-[var(--color-primary)]",
    icon: Bot,
  },
  human_app: {
    chip: "border-[color:color-mix(in_oklch,var(--color-text-muted)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-text-muted)_8%,transparent)]",
    text: "text-[var(--color-text-muted)]",
    icon: Users,
  },
  m2m: {
    chip: "border-[color:color-mix(in_oklch,#a855f7_25%,transparent)] bg-[color:color-mix(in_oklch,#a855f7_8%,transparent)]",
    text: "text-purple-600",
    icon: Monitor,
  },
  cli: {
    chip: "border-[color:color-mix(in_oklch,#f59e0b_25%,transparent)] bg-[color:color-mix(in_oklch,#f59e0b_8%,transparent)]",
    text: "text-amber-600",
    icon: Terminal,
  },
};

const KIND_LABELS: Record<WorkspaceClientItem["client_kind"], string> = {
  agent: "Agent",
  human_app: "Human app",
  m2m: "M2M",
  cli: "CLI",
};

const REGISTRATION_STYLES: Record<string, { chip: string; text: string }> = {
  dcr: {
    chip: "border-[color:color-mix(in_oklch,var(--color-text-muted)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-text-muted)_8%,transparent)]",
    text: "text-[var(--color-text-muted)]",
  },
  prereg: {
    chip: "border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]",
    text: "text-[var(--color-primary)]",
  },
  cimd: {
    chip: "border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]",
    text: "text-[var(--color-primary)]",
  },
};

const REGISTRATION_LABELS: Record<string, string> = {
  dcr: "DCR",
  prereg: "Pre-reg",
  cimd: "CIMD",
};

function statusTone(
  status: string,
  syncStatus: string,
): { chip: string; text: string; label: string } {
  if (syncStatus === "pending_delete" || status === "revoked") {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-danger)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_8%,transparent)]",
      text: "text-[var(--color-danger)]",
      label: syncStatus === "pending_delete" ? "Pending delete" : "Revoked",
    };
  }
  if (status === "pending_approval") {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
      text: "text-[var(--color-warning)]",
      label: "Pending approval",
    };
  }
  if (syncStatus === "sync_error") {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
      text: "text-[var(--color-warning)]",
      label: "Sync error",
    };
  }
  return {
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_8%,transparent)]",
    text: "text-[var(--color-success)]",
    label: "Approved",
  };
}

// ─── Relative time helper ─────────────────────────────────────────────────────

export function relativeTime(isoString: string | undefined): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  if (isNaN(diff)) return "—";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function ClientRowActions({ client }: { client: WorkspaceClientItem }) {
  const [revoking, setRevoking] = useState(false);
  const [revokeClient] = useRevokeWorkspaceClientMutation();
  const [approveClient, { isLoading: approving }] =
    useApproveWorkspaceClientMutation();

  const handleCopyId = () => {
    void navigator.clipboard.writeText(client.client_id).then(() => {
      toast.success("Client ID copied");
    });
  };

  const handleApprove = async () => {
    try {
      await approveClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success("Client approved for this workspace");
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      toast.error(e?.data?.error ?? "Failed to approve client");
    }
  };

  const handleRevoke = async () => {
    const label = client.status === "pending_approval" ? "Deny" : "Revoke";
    if (
      !window.confirm(
        `${label} "${client.client_name || client.client_id}"?\n\nImmediately revokes access to ${client.resource_server_name || "this application"}. Active sessions stop working at once. This affects only this workspace.`,
      )
    ) {
      return;
    }
    setRevoking(true);
    try {
      await revokeClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success(
        client.status === "pending_approval"
          ? "Request denied"
          : "Client revoked — active sessions cut immediately",
      );
    } catch (err: unknown) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message ?? "Failed to revoke client");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Client actions"
            disabled={revoking}
          >
            {revoking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {client.status === "pending_approval" && (
            <DropdownMenuItem
              onSelect={() => void handleApprove()}
              disabled={approving}
            >
              <Check className="mr-2 size-4" />
              Approve for this workspace
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={handleCopyId}>
            <Copy className="mr-2 size-4" />
            Copy client ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handleRevoke()}
            className="text-destructive focus:text-destructive"
            disabled={client.status === "revoked"}
          >
            <X className="mr-2 size-4" />
            {client.status === "pending_approval" ? "Deny" : "Revoke"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PendingClientDecision({ client }: { client: WorkspaceClientItem }) {
  const [approveClient, { isLoading: approving }] =
    useApproveWorkspaceClientMutation();
  const [revokeClient, { isLoading: denying }] = useRevokeWorkspaceClientMutation();

  if (client.status !== "pending_approval") {
    return (
      <span className="text-xs text-muted-foreground">
        {client.status === "approved" ? "Approved" : "—"}
      </span>
    );
  }

  const handleApprove = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await approveClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success("Client approved for this workspace");
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string } };
      toast.error(e?.data?.message ?? e?.data?.error ?? "Failed to approve client");
    }
  };

  const handleDeny = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (
      !window.confirm(
        `Deny "${client.client_name || client.client_id}"?\n\nThis client will not be able to connect to ${client.resource_server_name || "this application"}.`,
      )
    ) {
      return;
    }

    try {
      await revokeClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success("Request denied");
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string } };
      toast.error(e?.data?.message ?? e?.data?.error ?? "Failed to deny request");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        className="h-7 px-2 text-xs text-white"
        onClick={handleApprove}
        disabled={approving || denying}
      >
        {approving ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Check className="mr-1 size-3" />}
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={handleDeny}
        disabled={approving || denying}
      >
        {denying ? <Loader2 className="mr-1 size-3 animate-spin" /> : <X className="mr-1 size-3" />}
        Deny
      </Button>
    </div>
  );
}

// ─── Grouped row type ─────────────────────────────────────────────────────────

interface GroupedClientRow {
  groupKey: string;
  displayName: string;
  clientKind: WorkspaceClientItem["client_kind"];
  application: string;
  resourceServerId: string;
  instanceCount: number;
  lastTokenIssuedAt: string | undefined;
  pendingCount: number;
  instances: WorkspaceClientItem[];
}

// ─── Grouped row actions ──────────────────────────────────────────────────────

function GroupedRowActions({ group }: { group: GroupedClientRow }) {
  const [revoking, setRevoking] = useState(false);
  const [revokeClient] = useRevokeWorkspaceClientMutation();

  const handleRevokeAll = async () => {
    const active = group.instances.filter((c) => c.status !== "revoked");
    if (active.length === 0) return;
    if (
      !window.confirm(
        `Revoke all ${active.length} instance(s) of "${group.displayName}" in this workspace? Active sessions stop working at once.`,
      )
    ) {
      return;
    }
    setRevoking(true);
    try {
      await Promise.all(
        active.map((c) =>
          revokeClient({
            rsId: c.resource_server_id,
            clientId: c.client_id,
          }).unwrap(),
        ),
      );
      toast.success(`Revoked ${active.length} client(s) — active sessions cut immediately`);
    } catch (err: unknown) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message ?? "Failed to revoke clients");
    } finally {
      setRevoking(false);
    }
  };

  const allRevoked = group.instances.every((c) => c.status === "revoked");

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Group actions"
            disabled={revoking}
          >
            {revoking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            onSelect={() => void handleRevokeAll()}
            className="text-destructive focus:text-destructive"
            disabled={allRevoked}
          >
            <X className="mr-2 size-4" />
            Revoke all in this workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function GroupPendingDecision({ group }: { group: GroupedClientRow }) {
  const pending = group.instances.filter((c) => c.status === "pending_approval");
  const [approveClient] = useApproveWorkspaceClientMutation();
  const [revokeClient] = useRevokeWorkspaceClientMutation();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  if (pending.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const handleApprove = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setBusy("approve");
    try {
      await Promise.all(
        pending.map((client) =>
          approveClient({
            rsId: client.resource_server_id,
            clientId: client.client_id,
          }).unwrap(),
        ),
      );
      toast.success(
        pending.length === 1
          ? "Client approved for this workspace"
          : `Approved ${pending.length} pending clients`,
      );
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string } };
      toast.error(e?.data?.message ?? e?.data?.error ?? "Failed to approve clients");
    } finally {
      setBusy(null);
    }
  };

  const handleDeny = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (
      !window.confirm(
        `Deny ${pending.length} pending request${pending.length === 1 ? "" : "s"} for "${group.displayName}"?`,
      )
    ) {
      return;
    }

    setBusy("deny");
    try {
      await Promise.all(
        pending.map((client) =>
          revokeClient({
            rsId: client.resource_server_id,
            clientId: client.client_id,
          }).unwrap(),
        ),
      );
      toast.success(
        pending.length === 1
          ? "Request denied"
          : `Denied ${pending.length} pending requests`,
      );
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string } };
      toast.error(e?.data?.message ?? e?.data?.error ?? "Failed to deny requests");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        className="h-7 px-2 text-xs text-white"
        onClick={handleApprove}
        disabled={busy !== null}
      >
        {busy === "approve" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Check className="mr-1 size-3" />}
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        onClick={handleDeny}
        disabled={busy !== null}
      >
        {busy === "deny" ? <Loader2 className="mr-1 size-3 animate-spin" /> : <X className="mr-1 size-3" />}
        Deny
      </Button>
    </div>
  );
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedGroupRow({ row }: { row: Row<GroupedClientRow> }) {
  const group = row.original;
  const [revokeClient] = useRevokeWorkspaceClientMutation();
  const [approveClient] = useApproveWorkspaceClientMutation();
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());

  const handleRevoke = async (client: WorkspaceClientItem) => {
    if (
      !window.confirm(
        `Revoke "${client.client_name || client.client_id}"?\n\nImmediately cuts access to ${client.resource_server_name || "this application"}. This affects only this workspace.`,
      )
    )
      return;
    setRevokingIds((s) => new Set(s).add(client.client_id));
    try {
      await revokeClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success("Client revoked — active sessions cut immediately");
    } catch (err: unknown) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message ?? "Failed to revoke client");
    } finally {
      setRevokingIds((s) => {
        const next = new Set(s);
        next.delete(client.client_id);
        return next;
      });
    }
  };

  const handleApprove = async (client: WorkspaceClientItem) => {
    setApprovingIds((s) => new Set(s).add(client.client_id));
    try {
      await approveClient({
        rsId: client.resource_server_id,
        clientId: client.client_id,
      }).unwrap();
      toast.success("Client approved for this workspace");
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      toast.error(e?.data?.error ?? "Failed to approve client");
    } finally {
      setApprovingIds((s) => {
        const next = new Set(s);
        next.delete(client.client_id);
        return next;
      });
    }
  };

  return (
    <div className="border-t bg-muted/30 px-4 py-3 space-y-1.5">
      {group.instances.map((c) => {
        const tone = statusTone(c.status, c.sync_status);
        const isRevoking = revokingIds.has(c.client_id);
        const isApproving = approvingIds.has(c.client_id);
        return (
          <div
            key={c.client_id}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-background/60 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {c.client_name || c.client_id}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {c.client_id}
                {c.adopted_elsewhere && c.status === "pending_approval" && (
                  <span className="ml-2 font-sans text-[10px] text-[var(--color-warning)]">
                    requesting access from another workspace
                  </span>
                )}
                {c.adopted_elsewhere && c.status !== "pending_approval" && (
                  <span className="ml-2 font-sans text-[10px] text-[var(--color-warning)]">
                    registered via another workspace
                  </span>
                )}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                tone.chip,
                tone.text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {tone.label}
            </span>
            {/* For pending rows show when the request arrived; otherwise show last token */}
            <span className="text-xs text-muted-foreground shrink-0 w-24 text-right" title={c.status === "pending_approval" ? "Request arrived" : "Last token"}>
              {c.status === "pending_approval"
                ? relativeTime(c.created_at)
                : relativeTime(c.last_token_issued_at)}
            </span>
            {/* Per-registration approve (pending only) */}
            {c.status === "pending_approval" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleApprove(c);
                }}
                disabled={isApproving}
                className="shrink-0 inline-flex size-7 items-center justify-center rounded-md text-[var(--color-success)] hover:bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Approve client"
              >
                {isApproving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleRevoke(c);
              }}
              disabled={c.status === "revoked" || isRevoking}
              className="shrink-0 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={c.status === "pending_approval" ? "Deny request" : "Revoke client"}
            >
              {isRevoking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Grouped status helper ─────────────────────────────────────────────────────

function groupStatusTone(group: GroupedClientRow) {
  const anyRevoked = group.instances.some((c) => c.status === "revoked");
  const anyPending = group.instances.some(
    (c) => c.status === "pending_approval",
  );
  const anySyncError = group.instances.some(
    (c) => c.sync_status === "sync_error",
  );
  if (anyRevoked) {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-danger)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_8%,transparent)]",
      text: "text-[var(--color-danger)]",
      label: "Revoked",
    };
  }
  if (anyPending) {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
      text: "text-[var(--color-warning)]",
      label: "Pending",
    };
  }
  if (anySyncError) {
    return {
      chip: "border-[color:color-mix(in_oklch,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
      text: "text-[var(--color-warning)]",
      label: "Sync error",
    };
  }
  return {
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_8%,transparent)]",
    text: "text-[var(--color-success)]",
    label: "Approved",
  };
}

// ─── Main table component ─────────────────────────────────────────────────────

export function ClientsTable({
  scope,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
}: ClientsTableProps) {
  const queryArg =
    scope.kind === "resource_server"
      ? { resourceServerId: scope.rsId }
      : undefined;

  const { data: clients, isLoading, isError } = useListWorkspaceClientsQuery(queryArg);

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [internalStatusFilter, setInternalStatusFilter] =
    useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const statusFilter = controlledStatusFilter ?? internalStatusFilter;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatusFilter;

  const kindCounts = useMemo(() => {
    const all = clients ?? [];
    return {
      all: all.length,
      agent: all.filter((c) => c.client_kind === "agent").length,
      human_app: all.filter((c) => c.client_kind === "human_app").length,
      m2m: all.filter((c) => c.client_kind === "m2m").length,
      cli: all.filter((c) => c.client_kind === "cli").length,
    };
  }, [clients]);

  const statusCounts = useMemo(() => {
    const all = clients ?? [];
    return {
      all: all.length,
      pending_approval: all.filter((c) => c.status === "pending_approval").length,
      approved: all.filter((c) => c.status === "approved").length,
      revoked: all.filter((c) => c.status === "revoked").length,
    };
  }, [clients]);

  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase();

    // Apply filters
    let filtered = (clients ?? []).filter((c) => {
      if (kindFilter !== "all" && c.client_kind !== kindFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.client_name, c.software_id, c.client_id, c.resource_server_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

    // Sort pending rows to top (F1)
    filtered = filtered.slice().sort((a, b) => {
      const aPending = a.status === "pending_approval" ? 0 : 1;
      const bPending = b.status === "pending_approval" ? 0 : 1;
      return aPending - bPending;
    });

    return filtered;
  }, [clients, search, kindFilter, statusFilter]);

  const groupedRows = useMemo<GroupedClientRow[]>(() => {
    const map = new Map<string, WorkspaceClientItem[]>();
    for (const c of visibleClients) {
      const key = c.software_id || c.client_name || c.client_id;
      const existing = map.get(key);
      if (existing) {
        existing.push(c);
      } else {
        map.set(key, [c]);
      }
    }

    const rows = Array.from(map.entries()).map(([groupKey, instances]) => {
      const lastTokenIssuedAt = instances
        .map((c) => c.last_token_issued_at)
        .filter((t): t is string => Boolean(t))
        .sort()
        .at(-1);

      return {
        groupKey,
        displayName:
          instances[0].software_id ||
          instances[0].client_name ||
          instances[0].client_id,
        clientKind: instances[0].client_kind,
        application: instances[0].resource_server_name,
        resourceServerId: instances[0].resource_server_id,
        instanceCount: instances.length,
        lastTokenIssuedAt,
        pendingCount: instances.filter((c) => c.status === "pending_approval").length,
        instances,
      };
    });

    // Sort groups with any pending instances first
    return rows.sort((a, b) => (b.pendingCount > 0 ? 1 : 0) - (a.pendingCount > 0 ? 1 : 0));
  }, [visibleClients]);

  // ─── Flat columns ──────────────────────────────────────────────────────────

  const flatColumns = useMemo<AdaptiveColumn<WorkspaceClientItem>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => {
          const c = row.original;
          const displayName = c.client_name || c.software_id || c.client_id;
          return (
            <EntityCell
              label={displayName}
              detail={
                <span className="font-mono text-[11px] text-muted-foreground">
                  {c.client_id}
                  {c.adopted_elsewhere && c.status === "pending_approval" && (
                    <span className="ml-2 font-sans text-[10px] text-[var(--color-warning)]">
                      Requesting access from another workspace
                    </span>
                  )}
                  {c.adopted_elsewhere && c.status !== "pending_approval" && (
                    <span className="ml-2 font-sans text-[10px] text-[var(--color-warning)]">
                      Registered via another workspace
                    </span>
                  )}
                </span>
              }
            />
          );
        },
      },
      {
        id: "kind",
        header: "Kind",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => {
          const c = row.original;
          const style = KIND_STYLES[c.client_kind];
          const Icon = style.icon;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                style.chip,
                style.text,
              )}
            >
              <Icon className="size-3" aria-hidden />
              {KIND_LABELS[c.client_kind]}
            </span>
          );
        },
      },
      {
        id: "application",
        header: "Application",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.resource_server_name || (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        id: "registration",
        header: "Registration",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => {
          const type = row.original.registration_type;
          const style = REGISTRATION_STYLES[type] ?? REGISTRATION_STYLES.dcr;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                style.chip,
                style.text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {REGISTRATION_LABELS[type] ?? type}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => {
          const c = row.original;
          const tone = statusTone(c.status, c.sync_status);
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                tone.chip,
                tone.text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {tone.label}
            </span>
          );
        },
      },
      {
        id: "last-token",
        header: "Last token",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {relativeTime(row.original.last_token_issued_at)}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        priority: 5,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {relativeTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "decision",
        header: "Decision",
        alwaysVisible: true,
        approxWidth: 180,
        cell: ({ row }) => <PendingClientDecision client={row.original} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => <ClientRowActions client={row.original} />,
      },
    ],
    [],
  );

  // ─── Grouped columns ───────────────────────────────────────────────────────

  const groupedColumns = useMemo<AdaptiveColumn<GroupedClientRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => {
          const g = row.original;
          return (
            <EntityCell
              label={g.displayName}
              detail={
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    {g.instanceCount} instance{g.instanceCount === 1 ? "" : "s"}
                  </span>
                  {g.pendingCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[color:color-mix(in_oklch,var(--color-warning)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                      {g.pendingCount} pending
                    </span>
                  )}
                </span>
              }
            />
          );
        },
      },
      {
        id: "kind",
        header: "Kind",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => {
          const g = row.original;
          const style = KIND_STYLES[g.clientKind];
          const Icon = style.icon;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                style.chip,
                style.text,
              )}
            >
              <Icon className="size-3" aria-hidden />
              {KIND_LABELS[g.clientKind]}
            </span>
          );
        },
      },
      {
        id: "application",
        header: "Application",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.application || (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => {
          const tone = groupStatusTone(row.original);
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                tone.chip,
                tone.text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {tone.label}
            </span>
          );
        },
      },
      {
        id: "last-token",
        header: "Last token",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {relativeTime(row.original.lastTokenIssuedAt)}
          </span>
        ),
      },
      {
        id: "decision",
        header: "Decision",
        alwaysVisible: true,
        approxWidth: 180,
        cell: ({ row }) => <GroupPendingDecision group={row.original} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => <GroupedRowActions group={row.original} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const isEmpty = (clients?.length ?? 0) === 0;
  const noMatch = !isEmpty && visibleClients.length === 0;

  return (
    <div className="space-y-3">
      {/* Kind filter bar */}
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, client ID, or application"
        filters={KIND_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: kindCounts[f.key],
        }))}
        activeFilter={kindFilter}
        onFilterChange={(v) => setKindFilter(v as KindFilter)}
        trailing={
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {visibleClients.length} client
            {visibleClients.length === 1 ? "" : "s"}
          </span>
        }
      />

      {/* Status chips + view toggle row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            const count = statusCounts[f.key as keyof typeof statusCounts];
            const isPendingChip = f.key === "pending_approval";
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
                  active
                    ? isPendingChip
                      ? "border-[color:color-mix(in_oklch,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]"
                      : "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                    : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                )}
              >
                {f.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "" : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Grouped / flat toggle */}
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <TabsList className="h-7">
            <TabsTrigger value="grouped" className="gap-1.5 text-xs px-2.5 h-6">
              <Layers className="h-3 w-3" />
              Grouped
            </TabsTrigger>
            <TabsTrigger value="flat" className="gap-1.5 text-xs px-2.5 h-6">
              <List className="h-3 w-3" />
              Flat
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <TableCard>
        <CardContent variant="flush">
          {isError ? (
            <div className="py-16 text-center text-sm text-destructive">
              Unable to load clients. Check your connection and try refreshing.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading clients…
            </div>
          ) : isEmpty || noMatch ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {isEmpty ? "No clients yet" : "No clients match this filter"}
              </p>
              <p className="mt-1 max-w-sm mx-auto text-xs leading-5 text-muted-foreground">
                {isEmpty
                  ? "Agents and apps that connect to your MCP servers appear here after they register."
                  : "Try a different search term or filter."}
              </p>
              {(search || kindFilter !== "all" || statusFilter !== "all") ? (
                <button
                  className="mt-4 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                  onClick={() => {
                    setSearch("");
                    setKindFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : viewMode === "flat" ? (
            <AdaptiveTable
              tableId={`clients-flat-${scope.kind}`}
              data={visibleClients}
              columns={flatColumns}
              getRowId={(c) => c.client_id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{
                pageSize: 25,
                pageSizeOptions: [10, 25, 50, 100],
                alwaysVisible: true,
              }}
            />
          ) : (
            <AdaptiveTable
              tableId={`clients-grouped-${scope.kind}`}
              data={groupedRows}
              columns={groupedColumns}
              getRowId={(g) => g.groupKey}
              enableSelection={false}
              enableExpansion={true}
              renderExpandedRow={(row) => <ExpandedGroupRow row={row} />}
              pagination={{
                pageSize: 25,
                pageSizeOptions: [10, 25, 50, 100],
                alwaysVisible: true,
              }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
