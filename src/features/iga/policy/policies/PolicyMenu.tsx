/**
 * The header actions of a policy (SPEC-iga-phase3-policy.md §9.3 S5): a Pause /
 * Resume button, and the `⋯` menu: Edit (a new version), Pause policy / Resume, Remove AuthSec control…, Archive. An item
 * is hidden once the server has refused its permission, and disabled WITH its
 * reason when the policy's state rules it out (Archive while AuthSec still
 * controls a role). Each outward action confirms in a dialog that says what it
 * does, and shows the server's answer inline if it refuses.
 */

import { Archive, MoreHorizontal, Pause, Pencil, Play, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

import {
  useArchiveGovPolicyMutation,
  usePauseGovPolicyMutation,
  useResumeGovPolicyMutation,
  type GovControlRow,
  type GovPolicyView,
  type GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

import { RemoveControlDialog } from "../deployments/RemoveControlDialog";
import { PolicyActionError, roleNameOf, usePolicyAction, usePolicyPermission } from "../shared";
import { EditVersionDialog } from "./EditVersionDialog";
import { editBlockedReason } from "./policyModel";

const LIVE: GovControlRow["state"][] = ["active", "removing"];

type Dialogs = "edit" | "pause" | "resume" | "remove" | "archive" | null;

export function PolicyMenu({
  ws,
  policy,
  versions,
  onReload,
}: {
  ws: string;
  policy: GovPolicyView;
  versions: GovVersionView[] | undefined;
  onReload: () => void;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const author = usePolicyPermission("governance:author");
  const enforce = usePolicyPermission("governance:enforce");
  if (policy.lifecycle === "archived") return null;

  const live = (policy.controls ?? []).filter((c) => LIVE.includes(c.state));
  const editBlocked = editBlockedReason(versions?.[0]);
  const showAny = author.offered || enforce.offered;
  if (!showAny) return null;

  return (
    <>
      {enforce.offered ? (
        <Button variant="outline" onClick={() => setDialog(policy.lifecycle === "paused" ? "resume" : "pause")}>
          {policy.lifecycle === "paused" ? "Resume" : "Pause"}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Policy actions">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {author.offered ? (
            <MenuItem icon={<Pencil />} label="Edit" note={editBlocked ?? "Creates a new version"} disabled={!!editBlocked} onSelect={() => setDialog("edit")} />
          ) : null}
          {enforce.offered ? (
            policy.lifecycle === "paused" ? (
              <MenuItem icon={<Play />} label="Resume" note="Lets deployments start again" onSelect={() => setDialog("resume")} />
            ) : (
              <MenuItem icon={<Pause />} label="Pause policy" note="No new deployment starts" onSelect={() => setDialog("pause")} />
            )
          ) : null}
          {author.offered ? (
            <>
              <DropdownMenuSeparator />
              <MenuItem
                icon={<ShieldOff />}
                label="Remove AuthSec control…"
                note={live.length > 0 ? "Returns the access AuthSec removed" : "AuthSec controls no role of this policy"}
                disabled={live.length === 0}
                onSelect={() => setDialog("remove")}
              />
              <MenuItem
                icon={<Archive />}
                label="Archive"
                note={live.length > 0 ? "Remove AuthSec control first" : "Withdraws open versions; read-only after"}
                disabled={live.length > 0}
                destructive
                onSelect={() => setDialog("archive")}
              />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditVersionDialog policy={policy} versions={versions} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} onReload={onReload} />
      <LifecycleDialog policy={policy} kind="pause" open={dialog === "pause"} onClose={() => setDialog(null)} />
      <LifecycleDialog policy={policy} kind="resume" open={dialog === "resume"} onClose={() => setDialog(null)} />
      <ArchiveDialog policy={policy} open={dialog === "archive"} onClose={() => setDialog(null)} />
      <RemoveControlDialog ws={ws} policyId={policy.id} open={dialog === "remove"} onOpenChange={(o) => setDialog(o ? "remove" : null)} />
    </>
  );
}

function MenuItem({
  icon,
  label,
  note,
  disabled,
  destructive,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  note: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem disabled={disabled} variant={destructive ? "destructive" : "default"} onSelect={onSelect} className="items-start">
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs font-normal text-(--color-text-muted)">{note}</span>
      </span>
    </DropdownMenuItem>
  );
}

function LifecycleDialog({ policy, kind, open, onClose }: { policy: GovPolicyView; kind: "pause" | "resume"; open: boolean; onClose: () => void }) {
  const [pause] = usePauseGovPolicyMutation();
  const [resume] = useResumeGovPolicyMutation();
  const act = usePolicyAction("governance:enforce");
  const [reason, setReason] = useState("");
  const pausing = kind === "pause";

  async function go() {
    const res = await act.run(() => (pausing ? pause({ policyId: policy.id, reason: reason.trim() }) : resume({ policyId: policy.id, reason: reason.trim() })));
    if (res) {
      toast.success(pausing ? "Policy paused" : "Policy resumed");
      setReason("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? (act.clear(), onClose()) : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pausing ? `Pause ${policy.name}?` : `Resume ${policy.name}?`}</DialogTitle>
          <DialogDescription>
            {pausing
              ? "No new deployment starts while it is paused. What is already in AWS stays, and verification and drift checks continue. Rollout actions wait until you resume."
              : "Deployments and rollout actions can start again. Nothing starts by itself: the rollout continues from where it stopped when someone acts on it."}
          </DialogDescription>
        </DialogHeader>
        <label className="block text-[13px] font-medium text-(--color-text)" htmlFor={`${kind}-reason`}>
          Reason (required)
        </label>
        <Textarea id={`${kind}-reason`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pausing ? "Change freeze until Monday" : "Freeze is over"} />
        <PolicyActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={() => (act.clear(), onClose())} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || reason.trim() === ""}>
            {pausing ? "Pause policy" : "Resume policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({ policy, open, onClose }: { policy: GovPolicyView; open: boolean; onClose: () => void }) {
  const [archive] = useArchiveGovPolicyMutation();
  const act = usePolicyAction("governance:author");
  const [reason, setReason] = useState("");
  const blocking = act.failure?.code === "policy_controls_roles" ? ((act.failure.detail.controls as GovControlRow[] | undefined) ?? []) : [];

  async function go() {
    const res = await act.run(() => archive({ policyId: policy.id, reason: reason.trim() || undefined }));
    if (res) {
      toast.success("Policy archived");
      setReason("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? (act.clear(), onClose()) : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {policy.name}?</DialogTitle>
          <DialogDescription>
            Open versions (draft, in review or approved) are withdrawn and roles AuthSec only planned to control are released. The policy stays readable, with its history, and cannot be edited again.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-[13px] font-medium text-(--color-text)" htmlFor="archive-reason">
          Reason (optional)
        </label>
        <Textarea id="archive-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <PolicyActionError failure={act.failure}>
          {blocking.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {blocking.map((c) => (
                <li key={c.id}>
                  {roleNameOf(c.role_arn)} ({c.state})
                </li>
              ))}
            </ul>
          ) : null}
        </PolicyActionError>
        <DialogFooter>
          <Button variant="outline" onClick={() => (act.clear(), onClose())} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Archiving…" : "Archive policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
