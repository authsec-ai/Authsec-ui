import { ShieldAlert } from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";

import type { ResourceServerSecretState } from "../resource-server-utils";

interface ResourceServerSecretBannerProps {
  secret: ResourceServerSecretState;
  onDismiss?: () => void;
}

export function ResourceServerSecretBanner({
  secret,
  onDismiss,
}: ResourceServerSecretBannerProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="space-y-1">
            <div className="font-medium text-amber-900">
              One-time introspection secret {secret.source === "created" ? "created" : "rotated"}
            </div>
            <div className="break-all font-mono text-sm text-amber-800">{secret.value}</div>
            <div className="text-xs text-amber-700">
              Copy this now. AuthSec stores only the hash after this response and will not show the
              plaintext secret again.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CopyButton
            text={secret.value}
            label="introspection secret"
            variant="outline"
            showLabel
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          />
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs font-medium text-amber-800 underline-offset-4 hover:underline"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
