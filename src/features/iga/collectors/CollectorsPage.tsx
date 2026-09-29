/**
 * CollectorsPage — list enrolled collectors, generate enrollment tokens,
 * view details, and revoke access.
 *
 * Follows the ConsolePage + AdaptiveTable + RightDrawer pattern from
 * DiscoveredAgentsPage, adapted for the collector lifecycle.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";
import { ConsoleFilterBar, ConsoleRowActions, EntityCell } from "@/components/console/iam-console";
import { type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { AdaptiveTable } from "@/components/ui/adaptive-table";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerBody,
  DrawerHeader,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
} from "@/components/console/detail";
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
  useListCollectorsQuery,
  useRevokeCollectorMutation,
  type CollectorView,
  type CollectorStatus,
} from "@/app/api/collectorApi";
import { EnrollDialog } from "./EnrollDialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "revoked";

const KIND_LABELS: Record<string, string> = {
  linux_collector: "Linux",
  k8s_collector: "Kubernetes",
  node_sensor: "Node sensor",
};

function statusTone(status: CollectorStatus): ConsoleTone {
  if (status === "active") return "success";
  if (status === "revoked") return "danger";
  return "neutral";
}

function healthLabel(c: CollectorView): string {
  if (c.status === "revoked") return "Revoked";
  if (!c.health.last_seen_at) return "Never seen";
  const ago = Date.now() - new Date(c.health.last_seen_at).getTime();
  if (ago < 5 * 60_000) return "Healthy";
  if (ago < 30 * 60_000) return "Stale";
  return "Offline";
}

function healthTone(c: CollectorView): ConsoleTone {
  const label = healthLabel(c);
  if (label === "Healthy") return "success";
  if (label === "Stale") return "warning";
  if (label === "Offline" || label === "Revoked") return "danger";
  return "neutral";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ago = Date.now() - new Date(iso).getTime();
  if (ago < 60_000) return "Just now";
  if (ago < 3600_000) return `${Math.floor(ago / 60_000)}m ago`;
  if (ago < 86400_000) return `${Math.floor(ago / 3600_000)}h ago`;
  return `${Math.floor(ago / 86400_000)}d ago`;
}

function errorMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) return "Your role is missing the required permission.";
  if (status === 409) return "Version conflict — someone else changed this collector. Reload and try again.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}

// ── Revoke confirmation dialog ───────────────────────────────────────────────

function RevokeDialog({
  collector,
  open,
  onOpenChange,
  onDone,
}: {
  collector: CollectorView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [revoke, { isLoading: saving }] = useRevokeCollectorMutation();

  const submit = async () => {
    if (!collector || !reason.trim()) return;
    try {
      await revoke({
        id: collector.id,
        reason: reason.trim(),
        expected_version: collector.row_version,
      }).unwrap();
      toast.success("Collector revoked. It will stop syncing on its next heartbeat.");
      onDone();
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not revoke the collector."));
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
          <DialogTitle>Revoke collector</DialogTitle>
          <DialogDescription>
            Permanently revokes this collector's credential. It will stop syncing
            on its next heartbeat. This cannot be undone — re-enroll to reconnect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Collector</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
              {collector?.id}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Textarea
              id="revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Host decommissioned, credential compromised"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Required. Recorded in the audit log.</p>
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
            {saving ? "Revoking..." : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CollectorsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selected, setSelected] = useState<CollectorView | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CollectorView | null>(null);

  const queryParams = filter === "all" ? undefined : { status: filter as CollectorStatus };
  const { data, isLoading, error, refetch } = useListCollectorsQuery(queryParams, {
    pollingInterval: 30_000,
  });

  const collectors = data?.data ?? [];

  const items = useMemo(() => {
    if (!search) return collectors;
    const q = search.toLowerCase();
    return collectors.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q) ||
        c.agent_version.toLowerCase().includes(q),
    );
  }, [collectors, search]);

  // Summary counts
  const total = collectors.length;
  const active = collectors.filter((c) => c.status === "active").length;
  const healthy = collectors.filter((c) => healthLabel(c) === "Healthy").length;
  const revoked = collectors.filter((c) => c.status === "revoked").length;

  const columns = useMemo<AdaptiveColumn<CollectorView>[]>(
    () => [
      {
        id: "id",
        header: "Collector",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.id.slice(0, 8) + "..."}
            detail={KIND_LABELS[row.original.kind] ?? row.original.kind}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => (
          <StatusBadge tone={statusTone(row.original.status)}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "health",
        header: "Health",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => (
          <StatusBadge tone={healthTone(row.original)}>
            {healthLabel(row.original)}
          </StatusBadge>
        ),
      },
      {
        id: "version",
        header: "Version",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.agent_version || "—"}
          </span>
        ),
      },
      {
        id: "last_seen",
        header: "Last seen",
        priority: 4,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {relativeTime(row.original.health.last_seen_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  { label: "View details", onSelect: () => setSelected(c) },
                  ...(c.status === "active"
                    ? [
                        {
                          label: "Revoke",
                          destructive: true,
                          onSelect: () => setRevokeTarget(c),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Collectors"
      description="Host and node collectors streaming runtime observations."
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setEnrollOpen(true)}
        >
          <Plus className="size-4" />
          Generate token
        </Button>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: total },
          { label: "Active", value: active },
          { label: "Healthy", value: healthy },
          { label: "Revoked", value: revoked },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border bg-card px-4 py-3 text-card-foreground"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by ID, kind, or version..."
        filters={[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "revoked", label: "Revoked" },
        ]}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="iga-collectors"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(r) => setSelected(r)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "collectors", () => refetch(), "discovery:read")}
            emptyState={
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No collectors enrolled yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setEnrollOpen(true)}
                >
                  Generate your first token
                </Button>
              </div>
            }
          />
        </CardContent>
      </TableCard>

      {/* Detail drawer */}
      <RightDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaTitle="Collector details"
      >
        {selected ? (
          <>
            <DrawerHeader
              title={selected.id.slice(0, 12) + "..."}
              subtitle={KIND_LABELS[selected.kind] ?? selected.kind}
              badge={
                <StatusBadge tone={statusTone(selected.status)}>
                  {selected.status}
                </StatusBadge>
              }
            />
            <DrawerBody>
              <DrawerSection label="Identity">
                <DetailGrid>
                  <DetailRow label="ID" value={<CopyField value={selected.id} />} full />
                  <DetailRow label="Kind" value={KIND_LABELS[selected.kind] ?? selected.kind} />
                  <DetailRow label="Status" value={selected.status} />
                  <DetailRow label="Version" value={selected.agent_version || "—"} />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="Health">
                <DetailGrid>
                  <DetailRow
                    label="Health"
                    value={
                      <StatusBadge tone={healthTone(selected)}>
                        {healthLabel(selected)}
                      </StatusBadge>
                    }
                  />
                  <DetailRow
                    label="Last seen"
                    value={relativeTime(selected.health.last_seen_at)}
                  />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="Policy">
                <DetailGrid>
                  <DetailRow
                    label="Desired revision"
                    value={selected.desired_revision?.toString() ?? "—"}
                  />
                  <DetailRow
                    label="Applied revision"
                    value={selected.applied_revision?.toString() ?? "—"}
                  />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="References">
                <DetailGrid>
                  <DetailRow
                    label="Estate ID"
                    value={<CopyField value={selected.estate_id} />}
                    full
                  />
                  <DetailRow
                    label="Integration ID"
                    value={<CopyField value={selected.integration_id} />}
                    full
                  />
                  <DetailRow
                    label="Source ID"
                    value={<CopyField value={selected.discovery_source_id} />}
                    full
                  />
                </DetailGrid>
              </DrawerSection>
              {selected.coverage.length > 0 ? (
                <DrawerSection label="Coverage">
                  <div className="space-y-1">
                    {selected.coverage.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span>{c.object_class}</span>
                        <StatusBadge
                          tone={c.state === "active" ? "success" : "neutral"}
                        >
                          {c.state}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                </DrawerSection>
              ) : null}
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>

      {/* Dialogs */}
      <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
      <RevokeDialog
        collector={revokeTarget}
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRevokeTarget(null);
        }}
        onDone={() => void refetch()}
      />
    </ConsolePage>
  );
}
