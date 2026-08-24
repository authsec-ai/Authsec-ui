/**
 * Governance → Access Certification
 *
 * The campaign list. A campaign's lifecycle is draft → active → closed:
 * `generate` snapshots its items (a draft has none yet), reviewers decide each
 * item, and closing freezes an export for the auditor.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
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
import { EntityCell } from "@/components/console/iam-console";
import {
  governanceError,
  useListCampaignsQuery,
  useCreateCampaignMutation,
  type CertificationCampaign,
} from "@/app/api/governanceApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<CertificationCampaign["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-(--color-success-soft) text-(--color-success-text)",
  closed: "bg-muted text-muted-foreground",
};

function CreateCampaignDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [create, { isLoading: saving }] = useCreateCampaignMutation();

  const reset = () => {
    setName("");
    setDescription("");
    setDueAt("");
  };

  const submit = async () => {
    if (!name.trim()) return;
    try {
      const c = await create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueAt ? { due_at: new Date(dueAt).toISOString() } : {}),
      }).unwrap();
      toast.success("Campaign created as a draft. Generate its items next.");
      onCreated(c.id);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not create the campaign."));
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
          <DialogTitle>New certification campaign</DialogTitle>
          <DialogDescription>
            Creates a draft. Generating its items snapshots what needs review at that moment; you
            can scope which entitlements from the campaign once it exists.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cc-name">Name</Label>
            <Input
              id="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q3 agent access review"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-desc">Description (optional)</Label>
            <Textarea
              id="cc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-due">Due date (optional)</Label>
            <Input
              id="cc-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!name.trim() || saving}
            onClick={() => void submit()}
          >
            {saving ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CertificationPage() {
  const navigate = useNavigate();
  const { data, isError, error, refetch } = useListCampaignsQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const campaigns = useMemo(() => data?.items ?? [], [data]);

  const columns = useMemo<AdaptiveColumn<CertificationCampaign>[]>(
    () => [
      {
        id: "name",
        header: "Campaign",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell label={row.original.name} detail={row.original.description || undefined} />
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className={`${PILL} ${STATUS_STYLE[row.original.status]}`}>
            {row.original.status}
          </span>
        ),
      },
      {
        id: "progress",
        header: "Progress",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => {
          const c = row.original;
          const pct = c.items_total > 0 ? Math.round((c.items_decided / c.items_total) * 100) : 0;
          return (
            <div className="max-w-[170px]">
              <div className="text-xs text-foreground">
                {c.items_decided}/{c.items_total} decided
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-(--color-primary)"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: "due",
        header: "Due",
        priority: 3,
        approxWidth: 140,
        cell: ({ row }) =>
          row.original.due_at ? (
            <span
              className={
                row.original.overdue
                  ? "text-xs font-medium text-(--color-danger-text)"
                  : "text-xs text-muted-foreground"
              }
            >
              {row.original.overdue ? "Overdue · " : ""}
              {formatDistanceToNow(new Date(row.original.due_at), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Access Certification"
      description="Periodic reviews that certify who still needs the access they hold. Each campaign snapshots entitlements, routes them to reviewers, and freezes an auditable result at close."
      actions={
        <Button
          className="text-[length:var(--text-sm)] text-white"
          onClick={() => setCreateOpen(true)}
        >
          New campaign
        </Button>
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load campaigns.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the governance:read permission."
            : "The governance API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="certification-campaigns"
            columns={columns}
            data={campaigns}
            getRowId={(c) => c.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(c) => navigate(`/iga/certification/${c.id}`)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/iga/certification/${id}`)}
      />
    </ConsolePage>
  );
}
