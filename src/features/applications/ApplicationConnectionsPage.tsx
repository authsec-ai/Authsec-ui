import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListConnectionsQuery,
  useRevokeConnectionMutation,
  useListAccessRequestsQuery,
  useApproveRequestMutation,
  useDenyRequestMutation,
  type AgentConnection,
  type AccessRequest,
} from "@/app/api/agentIdentityApi";
import { useListRSRolesQuery } from "@/app/api/setupWizardApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApplicationContext } from "./useApplicationContext";
import CrossAppDebugger from "./components/CrossAppDebugger";

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":") ? roleName.split(":").pop() || roleName : roleName;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

// ── Approve dialog ────────────────────────────────────────────────────────────

function ApproveDialog({
  request,
  rsId,
  onClose,
}: {
  request: AccessRequest | null;
  rsId: string;
  onClose: () => void;
}) {
  const [roleId, setRoleId] = useState("");
  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !request });
  const [approveRequest, { isLoading }] = useApproveRequestMutation();
  const unmapped = !request?.acting_user;

  const handleApprove = async () => {
    if (!request || !roleId) return;
    try {
      await approveRequest({ rsId, requestId: request.request_id, roleId }).unwrap();
      toast.success("Request approved. Connection established.");
      setRoleId("");
      onClose();
    } catch (err) {
      const apiErr = err as { data?: { error?: string; message?: string } };
      toast.error(apiErr?.data?.message ?? apiErr?.data?.error ?? "Couldn't approve request.");
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) { setRoleId(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve with role</DialogTitle>
          <DialogDescription>
            Binds the role to the acting user and approves the agent connection in one step.
          </DialogDescription>
        </DialogHeader>

        {unmapped && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">Identity not mapped</p>
              <p className="mt-0.5 text-xs text-amber-700">
                The acting user couldn't be resolved to a workspace user. Resolve the identity
                mapping or enable JIT provisioning before approving.
              </p>
            </div>
          </div>
        )}

        {request && !unmapped && (
          <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">
              Agent: {request.requester_name || request.requester_client_id}
            </p>
            {request.acting_user && (
              <p className="text-xs text-muted-foreground">
                Acting user:{" "}
                {request.acting_user.name
                  ? `${request.acting_user.name} (${request.acting_user.email})`
                  : request.acting_user.email}
              </p>
            )}
            {(request.requested_scopes?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Requested scopes: {request.requested_scopes.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="approve-role-select">Role to assign to acting user</Label>
          <Select value={roleId} onValueChange={setRoleId} disabled={unmapped}>
            <SelectTrigger id="approve-role-select">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {(rolesData?.roles ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {labelRole(r.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setRoleId(""); onClose(); }}>Cancel</Button>
          <Button
            onClick={() => void handleApprove()}
            disabled={!roleId || isLoading || unmapped}
            className="text-white"
          >
            <CheckCircle className="mr-1.5 size-4" />
            {isLoading ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Deny dialog ───────────────────────────────────────────────────────────────

function DenyDialog({
  request,
  rsId,
  onClose,
}: {
  request: AccessRequest | null;
  rsId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [denyRequest, { isLoading }] = useDenyRequestMutation();

  const handleDeny = async () => {
    if (!request) return;
    try {
      await denyRequest({ rsId, requestId: request.request_id, reason: reason || undefined }).unwrap();
      toast.success("Request denied.");
      setReason("");
      onClose();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't deny request.");
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deny request</DialogTitle>
          <DialogDescription>
            Deny access from{" "}
            {request?.requester_name || request?.requester_client_id || "this agent"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="deny-reason">Reason (optional)</Label>
          <Textarea
            id="deny-reason"
            placeholder="e.g. Not yet authorized for this server…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setReason(""); onClose(); }}>Cancel</Button>
          <Button variant="destructive" onClick={() => void handleDeny()} disabled={isLoading}>
            <XCircle className="mr-1.5 size-4" />
            {isLoading ? "Denying…" : "Deny"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Requests section ──────────────────────────────────────────────────────────

const REQUEST_STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  denied: { label: "Denied", variant: "destructive" },
};

function RequestsSection({ rsId }: { rsId: string }) {
  const { data, isLoading } = useListAccessRequestsQuery(rsId);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [approveTarget, setApproveTarget] = useState<AccessRequest | null>(null);
  const [denyTarget, setDenyTarget] = useState<AccessRequest | null>(null);

  const requests = useMemo(() => {
    const items = data?.items ?? [];
    return statusFilter === "pending" ? items.filter((r) => r.status === "pending") : items;
  }, [data?.items, statusFilter]);

  const pendingCount = useMemo(
    () => (data?.items ?? []).filter((r) => r.status === "pending").length,
    [data?.items],
  );

  const columns = useMemo<AdaptiveColumn<AccessRequest>[]>(
    () => [
      {
        id: "requester",
        header: "Agent",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.requester_name || row.original.requester_client_id}
            detail={row.original.source_workspace || undefined}
          />
        ),
      },
      {
        id: "acting_user",
        header: "Acting user",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => {
          const u = row.original.acting_user;
          if (!u) {
            return (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="size-3" /> Not mapped
              </span>
            );
          }
          return (
            <EntityCell label={u.name || u.email} detail={u.name ? u.email : undefined} />
          );
        },
      },
      {
        id: "scopes",
        header: "Requested scopes",
        priority: 2,
        approxWidth: 220,
        cell: ({ row }) => {
          const scopes = row.original.requested_scopes ?? [];
          if (!scopes.length) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {scopes.slice(0, 3).map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-[11px]">{s}</Badge>
              ))}
              {scopes.length > 3 && (
                <Badge variant="outline" className="text-[11px]">+{scopes.length - 3}</Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => {
          const s = REQUEST_STATUS_BADGE[row.original.status] ?? REQUEST_STATUS_BADGE.pending;
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        id: "received",
        header: "Received",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 52,
        cell: ({ row }) => {
          const isPending = row.original.status === "pending";
          return (
            <ConsoleRowActions
              items={[
                { label: "Approve with role", disabled: !isPending, onSelect: () => setApproveTarget(row.original) },
                { label: "Deny", disabled: !isPending, destructive: true, onSelect: () => setDenyTarget(row.original) },
              ]}
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Access requests</h2>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-[var(--component-button-primary-bg)] px-1.5 py-px text-[10px] font-bold leading-none text-white">
              {pendingCount}
            </span>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending only</SelectItem>
            <SelectItem value="all">All requests</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading requests…</div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {statusFilter === "pending" ? "No pending requests" : "No access requests"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {statusFilter === "all"
                  ? "Requests appear here when an agent tries to connect to this application."
                  : "All requests have been handled."}
              </p>
            </div>
          ) : (
            <AdaptiveTable
              tableId="access-requests"
              data={requests}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.request_id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <ApproveDialog request={approveTarget} rsId={rsId} onClose={() => setApproveTarget(null)} />
      <DenyDialog request={denyTarget} rsId={rsId} onClose={() => setDenyTarget(null)} />
    </>
  );
}

// ── Connections section ───────────────────────────────────────────────────────

const ACCESS_METHOD_LABEL: Record<string, string> = {
  m2m: "Machine credential",
  xaa: "Cross-app assertion",
};

const CONNECTION_STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  approved: { label: "Active", variant: "default" },
  pending_approval: { label: "Pending", variant: "secondary" },
  revoked: { label: "Revoked", variant: "destructive" },
};

function ConnectionsSection({ rsId }: { rsId: string }) {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useListConnectionsQuery(rsId);
  const [revokeConnection, { isLoading: revoking }] = useRevokeConnectionMutation();

  const connections = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.client_name, c.client_id, c.access_method, c.authority?.name ?? "", c.granted_through?.role_name ?? "", ...(c.granted_through?.scopes ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.items, query]);

  const columns = useMemo<AdaptiveColumn<AgentConnection>[]>(
    () => [
      {
        id: "connection",
        header: "Connection",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.client_name}
            detail={
              <Badge variant="outline" className="mt-0.5 text-[11px]">
                {ACCESS_METHOD_LABEL[row.original.access_method] ?? row.original.access_method}
              </Badge>
            }
          />
        ),
      },
      {
        id: "authority",
        header: "Authority",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => {
          const auth = row.original.authority;
          if (!auth) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <EntityCell
              label={auth.name || auth.id}
              detail={
                <Badge variant="outline" className="mt-0.5 text-[11px]">
                  {auth.type === "service_account" ? "Machine identity" : "User"}
                </Badge>
              }
            />
          );
        },
      },
      {
        id: "granted_through",
        header: "Granted through",
        priority: 2,
        approxWidth: 260,
        cell: ({ row }) => {
          const gt = row.original.granted_through;
          if (!gt) return <span className="text-xs text-muted-foreground">—</span>;
          const scopes = gt.scopes ?? [];
          return (
            <div className="space-y-1">
              <Badge variant="secondary">{labelRole(gt.role_name)}</Badge>
              <div className="flex flex-wrap gap-1">
                {scopes.slice(0, 3).map((s) => (
                  <Badge key={s} variant="outline" className="font-mono text-[11px]">{s}</Badge>
                ))}
                {scopes.length > 3 && (
                  <Badge variant="outline" className="text-[11px]">+{scopes.length - 3}</Badge>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => {
          const s = CONNECTION_STATUS_BADGE[row.original.status] ?? CONNECTION_STATUS_BADGE.approved;
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        id: "connected",
        header: "Connected",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 52,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Revoke connection",
                disabled: revoking || row.original.status === "revoked",
                destructive: true,
                onSelect: async () => {
                  try {
                    await revokeConnection({ rsId, connectionId: row.original.connection_id }).unwrap();
                    toast.success("Connection revoked.");
                  } catch (err) {
                    const apiErr = err as { data?: { error?: string } };
                    toast.error(apiErr?.data?.error ?? "Couldn't revoke connection.");
                  }
                },
              },
            ]}
          />
        ),
      },
    ],
    [rsId, revokeConnection, revoking],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Active connections</h2>
      </div>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by agent, authority, role, or scope"
        trailing={
          query.trim() ? (
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>Clear</Button>
          ) : null
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading connections…</div>
          ) : connections.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {query ? "No connections match this search." : "No approved connections yet"}
              </p>
              {!query && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connections appear here after a request is approved or a machine credential is created.
                </p>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="agent-connections"
              data={connections}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(c) => c.connection_id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApplicationConnectionsPage() {
  const { application } = useApplicationContext();

  return (
    <div className="space-y-6">
      <RequestsSection rsId={application.id} />
      <div className="border-t pt-2" />
      <ConnectionsSection rsId={application.id} />
      <CrossAppDebugger applicationId={application.id} />
    </div>
  );
}
