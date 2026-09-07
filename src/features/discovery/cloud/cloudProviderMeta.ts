/**
 * Static, client-side metadata for the three cloud providers Cloud Discovery
 * knows about. Mirrors `src/features/connectors/providerMeta.ts`'s shape —
 * the backend catalog has no display metadata (color, initials, tagline) to
 * derive this from, and these three are fixed, not a dynamic catalog.
 */

import type { CloudProvider } from "@/app/api/cloudDiscoveryApi";

export interface CloudProviderMeta {
  key: CloudProvider;
  label: string;
  /** Text fallback, and the badge's accessible label. */
  initial: string;
  /**
   * Tile + glyph colour for the badge. The tile is deliberately white in
   * both themes: these are vendor marks, and a white chip is how each
   * vendor's brand guidance expects them to sit on an arbitrary background.
   * Only the glyph carries the brand colour.
   */
  colorClass: string;
  tagline: string;
  available: boolean;
}

export const CLOUD_PROVIDER_META: Record<CloudProvider, CloudProviderMeta> = {
  aws: {
    key: "aws",
    label: "AWS",
    initial: "AWS",
    colorClass: "bg-white border border-border text-[#232f3e]",
    tagline: "IAM identities, access keys and permissions in an AWS account.",
    available: true,
  },
  gcp: {
    key: "gcp",
    label: "GCP",
    initial: "GCP",
    colorClass: "bg-white border border-border text-[#4285f4]",
    tagline: "Service accounts and their access in a Google Cloud scope.",
    available: true,
  },
  azure: {
    key: "azure",
    label: "Azure",
    initial: "AZ",
    colorClass: "bg-white border border-border text-[#0078d4]",
    tagline: "Coming soon.",
    available: false,
  },
};

export function cloudProviderMeta(provider: CloudProvider): CloudProviderMeta {
  return CLOUD_PROVIDER_META[provider];
}
