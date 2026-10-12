/**
 * The confirm dialog every deployment and rollout action goes through
 * (SPEC-iga-phase3-policy.md §9.1, §9.3 S5): says exactly what will happen,
 * keeps the server's refusal inline under the buttons, and cannot be dismissed
 * while the request is in flight (a half-sent change must not look cancelled).
 */

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PolicyActionError, type PolicyFailure } from "../shared";

export function ActionFrame({
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
  failureExtra,
  onConfirm,
  confirmDisabled = false,
  cancelLabel = "Cancel",
  extraActions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  /** Omit for a dialog that only reports a result. */
  confirmLabel?: string;
  busyLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  failure?: PolicyFailure | null;
  /** More explanation of the refusal, shown under the server's words. */
  failureExtra?: ReactNode;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  cancelLabel?: string;
  /** Buttons between Cancel and the confirm button (an alternative path). */
  extraActions?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <div className="space-y-3 text-[13px] text-(--color-text)">{children}</div> : null}
        <PolicyActionError failure={failure ?? null}>{failureExtra}</PolicyActionError>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {confirmLabel ? cancelLabel : "Close"}
          </Button>
          {extraActions}
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

/** A required free-text reason, labelled the way the audit trail will show it. */
export function ReasonField({
  id,
  value,
  onChange,
  required = true,
  label = "Reason",
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-(--color-text)">
        {label}
        {required ? " (required, kept in the audit trail)" : " (optional, kept in the audit trail)"}
      </label>
      <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} aria-required={required} />
      {hint ? <p className="text-xs text-(--color-text-muted)">{hint}</p> : null}
    </div>
  );
}
