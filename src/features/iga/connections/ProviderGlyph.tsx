/** A provider's mark plus its word: never colour or a logo alone. */

import { Boxes, Github } from "lucide-react";

import type { ConnectionProvider } from "@/app/api/connectionsApi";
import { CloudProviderBadge } from "@/features/discovery/cloud/CloudProviderBadge";
import { cn } from "@/lib/utils";

import { PROVIDER_WORD } from "./connectionModel";

export function ProviderGlyph({ provider, size = "size-7", className }: { provider: ConnectionProvider; size?: string; className?: string }) {
  if (provider === "aws" || provider === "gcp") return <CloudProviderBadge provider={provider} size={size} />;
  const Icon = provider === "k8s" ? Boxes : Github;
  return (
    <span
      role="img"
      aria-label={PROVIDER_WORD[provider]}
      title={PROVIDER_WORD[provider]}
      className={cn("flex flex-none items-center justify-center rounded-md border border-border bg-muted p-1.5 text-foreground", size, className)}
    >
      <Icon className="size-full" aria-hidden />
    </span>
  );
}
