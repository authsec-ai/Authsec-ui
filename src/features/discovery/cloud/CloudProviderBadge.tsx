import type { CloudProvider } from "@/app/api/cloudDiscoveryApi";
import { cloudProviderMeta } from "./cloudProviderMeta";
import { CloudProviderLogo } from "./CloudProviderLogo";
import { cn } from "@/lib/utils";

/**
 * The provider chip: the vendor's real mark on a white tile.
 *
 * The mark is decorative (`aria-hidden` inside CloudProviderLogo), so the
 * accessible name comes from this element's `title`/`aria-label` rather than
 * the glyph — a screen reader announces "AWS", not an unlabelled graphic.
 */
export function CloudProviderBadge({
  provider,
  size = "size-7",
}: {
  provider: CloudProvider;
  size?: string;
}) {
  const meta = cloudProviderMeta(provider);
  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn(
        "flex flex-none items-center justify-center rounded-md p-1.5",
        size,
        meta.colorClass,
      )}
    >
      <CloudProviderLogo provider={provider} />
    </span>
  );
}
