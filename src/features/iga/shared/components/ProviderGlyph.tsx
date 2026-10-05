/**
 * A provider's mark with its name — the glyph alone never carries the meaning
 * (category colour and icon are always paired with words).
 */

import { Boxes, Github } from "lucide-react";

import { CloudProviderLogo } from "@/features/discovery/cloud/CloudProviderLogo";
import { cn } from "@/lib/utils";

export type GlyphProvider = "aws" | "gcp" | "k8s" | "github";

const GLYPH_PROVIDER_LABEL: Record<GlyphProvider, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  github: "GitHub",
};

export function ProviderGlyph({ provider, withName = false, className }: { provider: GlyphProvider; withName?: boolean; className?: string }) {
  const mark =
    provider === "aws" || provider === "gcp" ? (
      <span className="size-4 shrink-0 text-(--color-text-muted)">
        <CloudProviderLogo provider={provider} />
      </span>
    ) : provider === "k8s" ? (
      <Boxes aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
    ) : (
      <Github aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
    );
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={GLYPH_PROVIDER_LABEL[provider]}>
      {mark}
      {withName ? <span>{GLYPH_PROVIDER_LABEL[provider]}</span> : <span className="sr-only">{GLYPH_PROVIDER_LABEL[provider]}</span>}
    </span>
  );
}
