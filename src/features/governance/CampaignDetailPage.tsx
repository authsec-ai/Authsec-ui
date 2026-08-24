/**
 * Governance → Access Certification → Campaign detail
 *
 * Progress + the item queue + the item decision. The evidence panel is the point
 * of the whole feature: a reviewer deciding from a name alone is rubber-stamping,
 * so each item's provenance is rendered inline (reusing the Provenance drawer's
 * evidence component). Decision is keep | revoke | delegate — never "pending".
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerBody, DrawerHeader, DrawerSection } from "@/components/console/detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  governanceError,
  useGetCampaignQuery,
  useListCampaignItemsQuery,
  useGenerateCampaignMutation,
  useDecideItemMutation,
  useCloseCampaignMutation,
  type CertificationItem,
} from "@/app/api/governanceApi";
import { ProvenanceEvidenceById } from "./ProvenanceEvidence";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const DECISION_STYLE: Record<CertificationItem["decision"], string> = {
  pending: "bg-(--color-warning-soft) text-(--color-warning-text)",
  keep: "bg-(--color-success-soft) text-(--color-success-text)",
  revoke: "bg-(--color-danger-soft) text-(--color-danger-text)",
  delegate: "bg-muted text-muted-foreground",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDetailPage() {
  const { id = "" } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading } = useGetCampaignQuery(id, { skip: !id });
  const [pendingOnly, setPendingOnly] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);
  const { data: itemsData } = useListCampaignItemsQuery(
    { id, filters: { pending: pendingOnly, mine: mineOnly } },
    { skip: !id },
  );
  const items = useMemo(() => itemsData?.items ?? [], [itemsData]);

  const [generate, { isLoading: generating }] = useGenerateCampaignMutation();
  const [selected, setSelected] = useState<CertificationItem | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  if (isLoading) {
    return <ConsolePage title="Campaign" description="Loading…">{null}</ConsolePage>;
  }
  if (!campaign) {
    return (
      <ConsolePage title="Campaign" description="Not found.">
        <Button variant="outline" onClick={() => navigate("/iga/certification")}>
          <ArrowLeft className="size-4" /> Back to campaigns
        </Button>
      </ConsolePage>
    );
  }

  const isDraft = campaign.status === "draft";
  const isClosed = campaign.status === "closed";

  const runGenerate = async () => {
    try {
      await generate(id).unwrap();
      toast.success("Items generated. The review queue is ready.");
    } catch (err) {
      toast.error(governanceError(err, "Could not generate items."));
    }
  };

  const columns: AdaptiveColumn<CertificationItem>[] = [
    {
      id: "subject",
      header: "Subject",
      alwaysVisible: true,
      approxWidth: 240,
      cell: ({ row }) => (
        <EntityCell
          label={row.original.subject_label || row.original.subject_id}
          detail={row.original.subject_type}
        />
      ),
    },
    {
      id: "entitlement",
      header: "Entitlement",
      priority: 2,
      approxWidth: 220,
      cell: ({ row }) => (
        <span className="block max-w-[210px] truncate text-xs" title={row.original.entitlement_label}>
          {row.original.entitlement_label || row.original.entitlement_type}
        </span>
      ),
    },
    {
      id: "decision",
      header: "Decision",
      priority: 1,
      approxWidth: 110,
      cell: ({ row }) => (
        <span className={`${PILL} ${DECISION_STYLE[row.original.decision]}`}>
          {row.original.decision}
        </span>
      ),
    },
    {
      id: "reviewer",
      header: "Reviewer",
      priority: 3,
      approxWidth: 160,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.reviewer_label || "—"}
        </span>
      ),
    },
  ];

  return (
    <ConsolePage
      title={campaign.name}
      description={campaign.description || "Access certification campaign."}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/iga/certification")}>
            <ArrowLeft className="size-4" /> All campaigns
          </Button>
          {isDraft ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={generating}
              onClick={() => void runGenerate()}
            >
              {generating ? "Generating…" : "Generate items"}
            </Button>
          ) : null}
          {!isClosed && !isDraft ? (
            <Button variant="destructive" onClick={() => setCloseOpen(true)}>
              Close campaign
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={campaign.status} />
        <Stat label="Decided" value={`${campaign.items_decided} / ${campaign.items_total}`} />
        <Stat label="Kept" value={String(campaign.items_kept)} />
        <Stat label="Revoked" value={String(campaign.items_revoked)} />
      </div>

      {campaign.overdue ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs text-(--color-danger-text)">
          This campaign is past its due date with items still undecided.
        </div>
      ) : null}

      {isDraft ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No items yet</p>
          <p className="mx-auto mt-1 max-w-md">
            A draft campaign has no items until you generate them. Generating snapshots the
            entitlements in scope at that moment — that snapshot is what reviewers certify.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={pendingOnly}
                onCheckedChange={(c) => setPendingOnly(c === true)}
              />
              Undecided only
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={mineOnly} onCheckedChange={(c) => setMineOnly(c === true)} />
              Assigned to me
            </label>
          </div>

          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="certification-items"
                columns={columns}
                data={items}
                getRowId={(i) => i.id}
                enableSelection={false}
                enableExpansion={false}
                onRowClick={(i) => setSelected(i)}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
              />
            </CardContent>
          </TableCard>
        </>
      )}

      <ItemDecisionDrawer
        campaignId={id}
        item={selected}
        readOnly={isClosed}
        onClose={() => setSelected(null)}
      />

      <CloseCampaignDialog
        campaignId={id}
        pendingCount={campaign.items_total - campaign.items_decided}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />
    </ConsolePage>
  );
}

function ItemDecisionDrawer({
  campaignId,
  item,
  readOnly,
  onClose,
}: {
  campaignId: string;
  item: CertificationItem | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [decide, { isLoading: saving }] = useDecideItemMutation();

  const run = async (decision: "keep" | "revoke" | "delegate") => {
    if (!item) return;
    if (decision === "delegate" && !delegateTo.trim()) {
      toast.error("Choose who to delegate this review to.");
      return;
    }
    try {
      await decide({
        campaignId,
        itemId: item.id,
        body: {
          decision,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(decision === "delegate" ? { delegate_to: delegateTo.trim() } : {}),
        },
      }).unwrap();
      toast.success(`Marked ${decision}.`);
      setNote("");
      setDelegateTo("");
      onClose();
    } catch (err) {
      toast.error(governanceError(err, "Could not record the decision."));
    }
  };

  return (
    <RightDrawer open={item !== null} onClose={onClose} ariaTitle="Certification item">
      {item ? (
        <>
          <DrawerHeader
            title={item.subject_label || item.subject_id}
            subtitle={item.entitlement_label || item.entitlement_type}
            badge={
              <span className={`${PILL} ${DECISION_STYLE[item.decision]}`}>{item.decision}</span>
            }
          />
          <DrawerBody>
            {/* The evidence panel — decide from this, not from the name alone. */}
            <DrawerSection label="Provenance evidence">
              {item.entitlement_provenance_id ? (
                <ProvenanceEvidenceById id={item.entitlement_provenance_id} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  No linked provenance record for this item.
                </p>
              )}
            </DrawerSection>

            {item.evidence != null ? (
              <DrawerSection label="Additional evidence">
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(item.evidence, null, 2)}
                </pre>
              </DrawerSection>
            ) : null}

            {!readOnly && item.decision === "pending" ? (
              <DrawerSection label="Decision">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="ci-note">Note (optional)</Label>
                    <Textarea
                      id="ci-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ci-delegate">Delegate to (user id, only for delegate)</Label>
                    <Input
                      id="ci-delegate"
                      value={delegateTo}
                      onChange={(e) => setDelegateTo(e.target.value)}
                      placeholder="user id"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="text-[length:var(--text-sm)] text-white"
                      disabled={saving}
                      onClick={() => void run("keep")}
                    >
                      Keep
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={saving}
                      onClick={() => void run("revoke")}
                    >
                      Revoke
                    </Button>
                    <Button variant="outline" disabled={saving} onClick={() => void run("delegate")}>
                      Delegate
                    </Button>
                  </div>
                </div>
              </DrawerSection>
            ) : (
              <DrawerSection label="Decision">
                <p className="text-xs text-muted-foreground">
                  {readOnly
                    ? "This campaign is closed — decisions are frozen."
                    : `Already decided: ${item.decision}${
                        item.decision_note ? ` — ${item.decision_note}` : ""
                      }.`}
                </p>
              </DrawerSection>
            )}
          </DrawerBody>
        </>
      ) : null}
    </RightDrawer>
  );
}

function CloseCampaignDialog({
  campaignId,
  pendingCount,
  open,
  onOpenChange,
}: {
  campaignId: string;
  pendingCount: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [close, { isLoading: saving }] = useCloseCampaignMutation();
  const hasPending = pendingCount > 0;

  const submit = async (force: boolean) => {
    try {
      await close({ id: campaignId, body: { force } }).unwrap();
      toast.success("Campaign closed. The result is frozen for the auditor.");
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not close the campaign."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close campaign</DialogTitle>
          <DialogDescription>
            Closing is final. It freezes an export of every decision for the auditor and no
            further decisions can be recorded.
          </DialogDescription>
        </DialogHeader>
        {hasPending ? (
          <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
            <strong className="font-medium">
              {pendingCount} item{pendingCount === 1 ? "" : "s"} still undecided.
            </strong>{" "}
            <span className="text-foreground/80">
              Closing now records them as they stand. Only force-close if you accept that.
            </span>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={() => void submit(hasPending)}
          >
            {saving ? "Closing…" : hasPending ? "Force close" : "Close campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
