/**
 * The confirm dialog every Setup and legacy action goes through (SPEC-iga-phase3-
 * policy.md §9.3 S9, §9.5): says exactly what will happen, keeps the server's
 * refusal inline under the buttons, and cannot be dismissed while the request
 * is in flight (a half-sent revoke must not look cancelled).
 */

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PolicyActionError, type PolicyFailure } from "../shared";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  destructive = false,
  pending = false,
  failure,
  onConfirm,
  confirmDisabled = false,
  cancelLabel = "Cancel",
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  /** Omit to show a dialog with only a close button (a result). */
  confirmLabel?: string;
  busyLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  failure?: PolicyFailure | null;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  cancelLabel?: string;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className={wide ? "sm:max-w-xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <div className="space-y-3 text-[13px] text-(--color-text)">{children}</div> : null}
        <PolicyActionError failure={failure ?? null} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {confirmLabel ? cancelLabel : "Close"}
          </Button>
          {confirmLabel ? (
            <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending || confirmDisabled}>
              {pending ? (busyLabel ?? "Working…") : confirmLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
