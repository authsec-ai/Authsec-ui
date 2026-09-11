/**
 * "Connect a cloud" — the provider-selection step of Cloud Discovery
 * onboarding. Modeled directly on
 * `src/features/connectors/AddConnectorDialog.tsx`'s `step === "provider"`
 * card grid, the existing AuthSec pattern for "pick one of several sources."
 *
 * This dialog only picks a provider. It does not itself onboard anything —
 * `onContinue` hands control back to the caller, since the actual GCP wizard
 * (build stage 3) and AWS wizard (build stage 6) don't exist yet.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CloudProviderBadge } from "./CloudProviderBadge";
import { CLOUD_PROVIDER_META, type CloudProviderMeta } from "./cloudProviderMeta";
import type { CloudProvider } from "@/app/api/cloudDiscoveryApi";

const PROVIDERS: CloudProviderMeta[] = [
  CLOUD_PROVIDER_META.aws,
  CLOUD_PROVIDER_META.gcp,
  CLOUD_PROVIDER_META.azure,
];

export function CloudProviderPicker({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: (provider: CloudProvider) => void;
}) {
  const [selected, setSelected] = useState<CloudProvider | null>(null);

  const close = () => {
    setSelected(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect a cloud</DialogTitle>
          <DialogDescription>
            Choose where you want Cloud Discovery to discover from.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 py-2">
          {PROVIDERS.map((meta) => {
            const isSelected = selected === meta.key;
            return (
              <button
                key={meta.key}
                type="button"
                disabled={!meta.available}
                aria-disabled={!meta.available}
                onClick={() => meta.available && setSelected(meta.key)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                  !meta.available && "cursor-not-allowed opacity-60",
                  // Token fill, not bg-blue-50/40: that is a near-white blue,
                  // so in dark mode the selected provider card was a pale wash
                  // under light text. Every other surface in this card already
                  // uses tokens.
                  meta.available && isSelected
                    ? "border-[var(--component-button-primary-bg)] bg-(--color-primary-soft)"
                    : "border-border",
                  meta.available && !isSelected && "hover:border-[var(--color-border-strong)]",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  <CloudProviderBadge provider={meta.key} size="size-9" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {meta.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{meta.tagline}</p>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    meta.available
                      ? "bg-(--color-success-soft) text-(--color-success-text)"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {meta.available ? "Available" : "Coming soon"}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            className="text-[length:var(--text-sm)] text-white"
            onClick={() => {
              if (!selected) return;
              onContinue(selected);
              close();
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
