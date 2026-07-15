import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useDeleteApplicationMutation } from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { Application } from "../types";

interface DeleteApplicationDialogProps {
  application: Pick<Application, "id" | "name" | "resource_uri"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteApplicationDialog({
  application,
  open,
  onOpenChange,
  onDeleted,
}: DeleteApplicationDialogProps) {
  const [deleteApplication, { isLoading }] = useDeleteApplicationMutation();

  const handleDelete = async () => {
    if (!application) return;
    try {
      await deleteApplication(application.id).unwrap();
      toast.success(`Deleted "${application.name}".`);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't delete application.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isLoading) onOpenChange(nextOpen);
      }}
    >
      <DialogContent data-cr className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete application?</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{application?.name ?? "this application"}</strong>,
            its OAuth scopes, imported tools, access policy, and introspection
            credentials. Active clients lose access immediately.
          </DialogDescription>
        </DialogHeader>
        {application?.resource_uri ? (
          <div className="break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
            {application.resource_uri}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={isLoading || !application}
          >
            <Trash2 className="mr-1.5 size-4" />
            {isLoading ? "Deleting…" : "Delete application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
