/**
 * Delete an ended policy. It leaves the list for good; what it did stays in
 * the Logs. Only a policy that has ended offers this, so nothing of it is left
 * in its cloud when it goes.
 */

import { useEffect } from "react";
import { toast } from "react-hot-toast";

import { useDeleteAccessPolicyMutation, type AccessPolicy } from "@/app/api/igaAccessPoliciesApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PolicyActionError, usePolicyAction } from "../shared";
import { CLOUD, providerOf } from "./model";

export function DeletePolicyDialog({
  policy,
  onClose,
  onDeleted,
}: {
  policy: AccessPolicy | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [remove] = useDeleteAccessPolicyMutation();
  const act = usePolicyAction("governance:enforce");
  const open = !!policy;

  useEffect(() => {
    if (open) act.clear();
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!policy) return null;

  async function go() {
    if (!policy) return;
    const id = policy.id;
    const ok = await act.run(() => remove({ id }));
    if (ok) {
      toast.success("Policy deleted.");
      onClose();
      onDeleted?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this policy?</DialogTitle>
          <DialogDescription>
            {policy.name} leaves the Policies list for good. It has already ended and nothing of it is left in {CLOUD[providerOf(policy.resource)].label}. What it did stays in the Logs.
          </DialogDescription>
        </DialogHeader>
        <PolicyActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant="destructive" className="text-white" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Deleting…" : "Delete policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
