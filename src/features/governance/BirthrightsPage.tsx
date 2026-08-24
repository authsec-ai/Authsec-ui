/**
 * Governance → Birthrights & Lifecycle
 *
 * Birthright access grants a role automatically on joining a group (or the whole
 * workspace). Lifecycle (JML) reconciles those grants as people join, move, and
 * leave. Four things this screen must get right, all of them safety defaults:
 *
 *   - Reconcile runs as a DRY RUN first, shown as a plan; running it for real
 *     needs a second explicit confirmation.
 *   - on_unmatch defaults to `flag`, not `revoke`. Revoke is presented as the
 *     opt-in it is — a mistyped group membership must not silently strip access.
 *   - match_kind "all" targets the ENTIRE workspace and is confirmed, not a
 *     casual radio next to `group`.
 *   - A standing birthright (empty duration) requires a justification.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell, ConsoleRowActions } from "@/components/console/iam-console";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { useGetRolesQuery } from "@/app/api/rolesApi";
import {
  governanceError,
  useListBirthrightsQuery,
  useCreateBirthrightMutation,
  useDeleteBirthrightMutation,
  useReconcileJmlMutation,
  useListStaleBirthrightsQuery,
  useListOrphanedAgentsQuery,
  type BirthrightPolicy,
  type ReconcileResult,
  type StaleBirthright,
  type OrphanedAgent,
} from "@/app/api/governanceApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const DURATION_OPTIONS = [
  { value: "", label: "Standing (never expires)" },
  { value: "168h", label: "7 days" },
  { value: "720h", label: "30 days" },
  { value: "2160h", label: "90 days" },
];

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateBirthrightDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [matchKind, setMatchKind] = useState<"group" | "all">("group");
  const [matchGroupId, setMatchGroupId] = useState("");
  const [resourceServerId, setResourceServerId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [duration, setDuration] = useState("720h");
  const [justification, setJustification] = useState("");
  const [onUnmatch, setOnUnmatch] = useState<"flag" | "revoke">("flag");
  const [confirmAll, setConfirmAll] = useState(false);

  const [create, { isLoading: saving }] = useCreateBirthrightMutation();
  const { data: resourceServers } = useListResourceServersQuery();
  const { data: roles } = useGetRolesQuery({});

  const isStanding = duration === "";
  const needsJustification = isStanding && !justification.trim();
  const needsGroup = matchKind === "group" && !matchGroupId.trim();
  const needsAllConfirm = matchKind === "all" && !confirmAll;
  const canSubmit =
    !!name.trim() &&
    !!resourceServerId &&
    !!roleId &&
    !needsJustification &&
    !needsGroup &&
    !needsAllConfirm;

  const reset = () => {
    setName("");
    setMatchKind("group");
    setMatchGroupId("");
    setResourceServerId("");
    setRoleId("");
    setDuration("720h");
    setJustification("");
    setOnUnmatch("flag");
    setConfirmAll(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create({
        name: name.trim(),
        match_kind: matchKind,
        ...(matchKind === "group" ? { match_group_id: matchGroupId.trim() } : {}),
        resource_server_id: resourceServerId,
        role_id: roleId,
        ...(duration ? { duration } : {}),
        ...(justification.trim() ? { justification: justification.trim() } : {}),
        on_unmatch: onUnmatch,
      }).unwrap();
      toast.success("Birthright policy created.");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not create the birthright."));
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
          <DialogTitle>New birthright policy</DialogTitle>
          <DialogDescription>
            Grants a role automatically to everyone who matches. Its blast radius is an entire
            group — or the whole workspace — so the safety defaults below matter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="br-name">Name</Label>
            <Input id="br-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="br-match">Applies to</Label>
            <Select value={matchKind} onValueChange={(v) => setMatchKind(v as "group" | "all")}>
              <SelectTrigger id="br-match">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Members of a group</SelectItem>
                <SelectItem value="all">The entire workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {matchKind === "group" ? (
            <div className="space-y-2">
              <Label htmlFor="br-group">Group id</Label>
              <Input
                id="br-group"
                value={matchGroupId}
                onChange={(e) => setMatchGroupId(e.target.value)}
                placeholder="group id"
              />
            </div>
          ) : (
            <label className="flex items-start gap-2 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
              <Checkbox
                checked={confirmAll}
                onCheckedChange={(c) => setConfirmAll(c === true)}
                className="mt-0.5"
              />
              <span>
                <strong className="font-medium">This grants the role to everyone.</strong> Every
                current and future member of the workspace will receive it. Confirm you mean the
                entire workspace, not a group.
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="br-rs">Resource server</Label>
            <Select value={resourceServerId} onValueChange={setResourceServerId}>
              <SelectTrigger id="br-rs">
                <SelectValue placeholder="Select a resource server…" />
              </SelectTrigger>
              <SelectContent>
                {(resourceServers ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="br-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="br-role">
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {(roles ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="br-dur">Grant duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="br-dur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value || "standing"} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isStanding ? (
              <p className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                A standing grant never expires — justify it below.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="br-just">
              Justification{isStanding ? " (required for standing)" : " (optional)"}
            </Label>
            <Textarea
              id="br-just"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="br-unmatch">When someone stops matching</Label>
            <Select value={onUnmatch} onValueChange={(v) => setOnUnmatch(v as "flag" | "revoke")}>
              <SelectTrigger id="br-unmatch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flag">Flag for review (default, safe)</SelectItem>
                <SelectItem value="revoke">Revoke automatically (opt-in)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {onUnmatch === "revoke"
                ? "A mistyped or transient group change will remove access with no human in the loop. Prefer flag unless you are certain."
                : "Leaving a group flags the grant for a human to review rather than removing access automatically."}
            </p>
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
            {saving ? "Creating…" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconcile dialog: dry-run first, explicit confirm to run for real ─────────

function ReconcileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [plan, setPlan] = useState<ReconcileResult | null>(null);
  const [reconcile, { isLoading: running }] = useReconcileJmlMutation();

  const reset = () => setPlan(null);

  const runDry = async () => {
    try {
      const r = await reconcile({ dryRun: true }).unwrap();
      setPlan(r);
    } catch (err) {
      toast.error(governanceError(err, "Could not compute the reconcile plan."));
    }
  };

  const runReal = async () => {
    try {
      const r = await reconcile({ dryRun: false }).unwrap();
      toast.success(
        `Reconcile complete: ${r.grants_created} created, ${r.stale_flagged} flagged, ${r.bindings_revoked} revoked.`,
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Reconcile failed."));
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
          <DialogTitle>Reconcile lifecycle</DialogTitle>
          <DialogDescription>
            Applies birthrights to current members and processes leavers. Always previewed as a
            plan first — nothing changes until you confirm.
          </DialogDescription>
        </DialogHeader>

        {plan ? (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <PlanLine label="Grants created" value={plan.grants_created} />
              <PlanLine label="Stale flagged" value={plan.stale_flagged} />
              <PlanLine label="Stale revoked" value={plan.stale_revoked} warn />
              <PlanLine label="Leavers processed" value={plan.leavers_processed} />
              <PlanLine label="Bindings revoked" value={plan.bindings_revoked} warn />
              <PlanLine label="Tokens revoked" value={plan.tokens_revoked} warn />
              <PlanLine label="Orphaned agents" value={plan.orphaned_agents} />
            </div>
            {plan.errors?.length ? (
              <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
                {plan.errors.join("; ")}
              </div>
            ) : null}
            <p className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
              This is a preview. Running it for real will create and revoke the grants above.
            </p>
          </div>
        ) : (
          <p className="py-4 text-xs text-muted-foreground">
            Compute the plan to see exactly what a reconcile would create and revoke before running
            it.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {plan ? (
            <Button variant="destructive" disabled={running} onClick={() => void runReal()}>
              {running ? "Running…" : "Run for real"}
            </Button>
          ) : (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={running}
              onClick={() => void runDry()}
            >
              {running ? "Computing…" : "Preview plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanLine({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={warn && value > 0 ? "font-semibold text-(--color-danger-text)" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BirthrightsPage() {
  const { data: birthrightsData } = useListBirthrightsQuery();
  const { data: staleData } = useListStaleBirthrightsQuery();
  const { data: orphansData } = useListOrphanedAgentsQuery();
  const [deleteBirthright] = useDeleteBirthrightMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const birthrights = useMemo(() => birthrightsData?.items ?? [], [birthrightsData]);
  const stale = useMemo(() => staleData?.items ?? [], [staleData]);
  const orphans = useMemo(() => orphansData?.items ?? [], [orphansData]);

  const onDelete = async (b: BirthrightPolicy) => {
    try {
      const r = await deleteBirthright(b.id).unwrap();
      // Delete does NOT revoke existing grants — they surface in stale. Show the note.
      toast.success(r.note || "Policy deleted. Existing grants remain for review.");
    } catch (err) {
      toast.error(governanceError(err, "Could not delete the birthright."));
    }
  };

  const brColumns: AdaptiveColumn<BirthrightPolicy>[] = [
    {
      id: "name",
      header: "Policy",
      alwaysVisible: true,
      approxWidth: 240,
      cell: ({ row }) => (
        <EntityCell label={row.original.name} detail={row.original.description || undefined} />
      ),
    },
    {
      id: "applies",
      header: "Applies to",
      priority: 1,
      approxWidth: 160,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.match_kind === "all" ? "Entire workspace" : "Group"}
        </span>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      priority: 2,
      approxWidth: 120,
      cell: ({ row }) =>
        row.original.duration ? (
          <span className="text-xs text-muted-foreground">{row.original.duration}</span>
        ) : (
          <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
            Standing
          </span>
        ),
    },
    {
      id: "unmatch",
      header: "On unmatch",
      priority: 3,
      approxWidth: 120,
      cell: ({ row }) => (
        <span
          className={
            row.original.on_unmatch === "revoke"
              ? "text-xs font-medium text-(--color-danger-text)"
              : "text-xs text-muted-foreground"
          }
        >
          {row.original.on_unmatch}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      alwaysVisible: true,
      approxWidth: 56,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ConsoleRowActions
            items={[
              {
                label: "Delete policy…",
                destructive: true,
                onSelect: () => void onDelete(row.original),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const staleColumns: AdaptiveColumn<StaleBirthright>[] = [
    {
      id: "user",
      header: "User",
      alwaysVisible: true,
      approxWidth: 200,
      cell: ({ row }) => (
        <EntityCell label={row.original.user_label || row.original.user_id} detail={undefined} />
      ),
    },
    {
      id: "entitlement",
      header: "Entitlement",
      priority: 1,
      approxWidth: 220,
      cell: ({ row }) => (
        <span className="block max-w-[210px] truncate text-xs">{row.original.entitlement_label}</span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      priority: 2,
      approxWidth: 200,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.reason}</span>
      ),
    },
    {
      id: "granted",
      header: "Granted",
      priority: 3,
      approxWidth: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.granted_at), { addSuffix: true })}
        </span>
      ),
    },
  ];

  const orphanColumns: AdaptiveColumn<OrphanedAgent>[] = [
    {
      id: "agent",
      header: "Agent",
      alwaysVisible: true,
      approxWidth: 220,
      cell: ({ row }) => (
        <EntityCell label={row.original.display_name || row.original.client_id} detail={row.original.client_id} />
      ),
    },
    {
      id: "owner",
      header: "Former owner",
      priority: 1,
      approxWidth: 200,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.owner_email}</span>
      ),
    },
    {
      id: "governance",
      header: "Governance",
      priority: 2,
      approxWidth: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.governance_status}</span>
      ),
    },
    {
      id: "runtime",
      header: "Runtime",
      priority: 3,
      approxWidth: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.runtime_status || "—"}</span>
      ),
    },
  ];

  return (
    <ConsolePage
      title="Birthrights & Lifecycle"
      description="Automatic access on join, and the joiner/mover/leaver reconciliation that keeps it honest as people and agents come and go."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setReconcileOpen(true)}>
            Reconcile…
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            onClick={() => setCreateOpen(true)}
          >
            New birthright
          </Button>
        </div>
      }
    >
      <div>
        <h2 className="mb-2 text-sm font-semibold">Birthright policies</h2>
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="birthrights"
              columns={brColumns}
              data={birthrights}
              getRowId={(b) => b.id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50], alwaysVisible: false }}
            />
          </CardContent>
        </TableCard>
      </div>

      <div>
        <h2 className="mb-1 mt-2 text-sm font-semibold">
          Stale grants {stale.length > 0 ? `(${stale.length})` : ""}
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Grants flagged by reconcile — including any left behind when a policy was deleted.
          Deleting a policy never revokes existing grants; they land here for a human to review.
        </p>
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="stale-birthrights"
              columns={staleColumns}
              data={stale}
              getRowId={(s) => s.provenance_id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50], alwaysVisible: false }}
            />
          </CardContent>
        </TableCard>
      </div>

      <div>
        <h2 className="mb-1 mt-2 text-sm font-semibold">
          Orphaned agents {orphans.length > 0 ? `(${orphans.length})` : ""}
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Agents whose owner has left. They are deliberately not killed — someone re-owns or
          deprovisions each one. This is a decision queue, not an incident.
        </p>
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="orphaned-agents"
              columns={orphanColumns}
              data={orphans}
              getRowId={(o) => o.oauth_client_id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50], alwaysVisible: false }}
            />
          </CardContent>
        </TableCard>
      </div>

      <CreateBirthrightDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ReconcileDialog open={reconcileOpen} onOpenChange={setReconcileOpen} />
    </ConsolePage>
  );
}
