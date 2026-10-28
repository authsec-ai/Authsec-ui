/**
 * ApprovalInbox — reviewer-focused view of pending access requests (Batch 10, U33).
 *
 * Shows only pending requests by default with inline Approve/Deny actions.
 * Each action opens a reason dialog before calling the mutation.
 */

import { useMemo, useState, useCallback } from "react";
import { Check, X } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { AdaptiveTable } from "@/components/ui/adaptive-table";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { tableFailure } from "@/components/console/load-failure";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  useListIgaAccessRequestsQuery,
  useApproveIgaRequestMutation,
  useDenyIgaRequestMutation,
  type AccessRequest,
  type AccessRequestState,
} from "@/app/api/igaAccessApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Filter = "all" | AccessRequestState;

function stateTone(s: AccessRequestState): ConsoleTone {
  switch (s) {
    case "pending":
      return "warning";
    case "approved":
      return "success";
    case "denied":
      return "danger";
    case "cancelled":
      return "neutral";
    case "expired":
      return "neutral";
    default:
      return "neutral";
  }
}

const STATE_LABELS: Record<AccessRequestState, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  expired: "Expired",
};

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

// ── Decision dialog ──────────────────────────────────────────────────────────

type DecisionKind = "approve" | "deny";

interface DecisionDialogProps {
  open: boolean;
  kind: DecisionKind;
  request: AccessRequest | null;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function DecisionDialog({ open, kind, request, loading, onConfirm, onCancel }: DecisionDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = useCallback(() => {
    onConfirm(reason);
    setReason("");
  }, [reason, onConfirm]);

  const handleCancel = useCallback(() => {
    setReason("");
    onCancel();
  }, [onCancel]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {kind === "approve" ? "Approve request" : "Deny request"}
          </DialogTitle>
          <DialogDescription>
            {kind === "approve"
              ? "Provide a reason for approving this access request. A lease will be issued."
              : "Provide a reason for denying this access request."}
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="space-y-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
            <div><span className="text-muted-foreground">Requester:</span> {request.requester_id}</div>
            <div><span className="text-muted-foreground">Resource:</span> {request.resource_id}</div>
            <div><span className="text-muted-foreground">Action:</span> <span className="font-mono">{request.action}</span></div>
            {request.reason && (
              <div><span className="text-muted-foreground">Reason:</span> {request.reason}</div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="decision-reason">Decision reason</Label>
          <Textarea
            id="decision-reason"
            placeholder={kind === "approve" ? "Why is this access appropriate?" : "Why is this request being denied?"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={kind === "approve" ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={!reason.trim() || loading}
          >
            {loading ? "Submitting..." : kind === "approve" ? "Approve" : "Deny"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ApprovalInboxPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  // Decision dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<DecisionKind>("approve");
  const [dialogTarget, setDialogTarget] = useState<AccessRequest | null>(null);

  const { data: requests = [], isLoading, error, refetch } = useListIgaAccessRequestsQuery();
  const [approveRequest, { isLoading: approving }] = useApproveIgaRequestMutation();
  const [denyRequest, { isLoading: denying }] = useDenyIgaRequestMutation();

  const items = useMemo(() => {
    let rows = requests;
    if (filter !== "all") {
      rows = rows.filter((r) => r.state === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.requester_id.toLowerCase().includes(q) ||
          r.resource_id.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [requests, filter, search]);

  const openDecisionDialog = useCallback((kind: DecisionKind, request: AccessRequest) => {
    setDialogKind(kind);
    setDialogTarget(request);
    setDialogOpen(true);
  }, []);

  const handleDecision = useCallback(
    async (reason: string) => {
      if (!dialogTarget) return;
      try {
        if (dialogKind === "approve") {
          await approveRequest({ id: dialogTarget.id, reason }).unwrap();
          toast.success("Request approved. Lease issued.");
        } else {
          await denyRequest({ id: dialogTarget.id, reason }).unwrap();
          toast.success("Request denied.");
        }
        setDialogOpen(false);
        setDialogTarget(null);
      } catch (err) {
        toast.error(
          `Failed to ${dialogKind} request: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [dialogTarget, dialogKind, approveRequest, denyRequest],
  );

  const pendingCount = requests.filter((r) => r.state === "pending").length;

  const columns = useMemo<AdaptiveColumn<AccessRequest>[]>(
    () => [
      {
        id: "requester",
        header: "Requester",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.requester_id}
            detail={row.original.subject_id !== row.original.requester_id ? `for ${row.original.subject_id}` : undefined}
          />
        ),
      },
      {
        id: "resource",
        header: "Resource",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-(--color-text)">
            {row.original.resource_id}
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.action}
          </span>
        ),
      },
      {
        id: "reason",
        header: "Reason",
        priority: 3,
        approxWidth: 200,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground line-clamp-2">
            {row.original.reason || "--"}
          </span>
        ),
      },
      {
        id: "state",
        header: "State",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => (
          <StatusBadge tone={stateTone(row.original.state)}>
            {STATE_LABELS[row.original.state] ?? row.original.state}
          </StatusBadge>
        ),
      },
      {
        id: "age",
        header: "Requested",
        priority: 2,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {timeAgo(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        priority: 0,
        approxWidth: 160,
        cell: ({ row }) =>
          row.original.state === "pending" ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  openDecisionDialog("approve", row.original);
                }}
              >
                <Check className="size-3.5" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  openDecisionDialog("deny", row.original);
                }}
              >
                <X className="size-3.5" />
                Deny
              </Button>
            </div>
          ) : null,
      },
    ],
    [openDecisionDialog],
  );

  return (
    <ConsolePage
      title="Approval Inbox"
      description="Review and act on pending access requests."
    >
      {/* Pending badge */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card px-4 py-3 text-card-foreground">
          <p className="text-xs text-muted-foreground">Pending review</p>
          <p className="text-2xl font-semibold tabular-nums">{pendingCount}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-card-foreground">
          <p className="text-xs text-muted-foreground">Total requests</p>
          <p className="text-2xl font-semibold tabular-nums">{requests.length}</p>
        </div>
      </div>

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by requester, resource, or reason..."
        filters={[
          { key: "pending", label: "Pending" },
          { key: "all", label: "All" },
          { key: "approved", label: "Approved" },
          { key: "denied", label: "Denied" },
        ]}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="iga-approval-inbox"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "access requests", () => refetch(), "iga:access:read")}
            emptyState={
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {filter === "pending"
                    ? "No pending requests to review."
                    : "No access requests found."}
                </p>
              </div>
            }
          />
        </CardContent>
      </TableCard>

      {/* Approve / Deny decision dialog */}
      <DecisionDialog
        open={dialogOpen}
        kind={dialogKind}
        request={dialogTarget}
        loading={approving || denying}
        onConfirm={handleDecision}
        onCancel={() => {
          setDialogOpen(false);
          setDialogTarget(null);
        }}
      />
    </ConsolePage>
  );
}
