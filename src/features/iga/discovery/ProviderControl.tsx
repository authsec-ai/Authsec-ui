import type { ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ProviderGlyph } from "../shared/components/ProviderGlyph";
import type { DiscoveryProvider } from "./urlState";

/** The provider's full name beside its mark: AWS's mark already says "aws". */
const FULL_NAME: Record<DiscoveryProvider, string> = {
  aws: "Amazon Web Services",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  github: "GitHub",
};

function ProviderValue({ provider }: { provider: DiscoveryProvider }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {/* Full-strength ink at a readable size: the muted 16px mark was a smudge. */}
      <ProviderGlyph provider={provider} className="[&>*:first-child]:size-5 [&>*:first-child]:text-(--color-text)" />
      <span className="truncate" aria-hidden="true">
        {FULL_NAME[provider]}
      </span>
    </span>
  );
}

/**
 * Which provider Discovery shows: a labelled select in the page header, with
 * Refresh (and, on Latest collected, the way back to Published) beside it.
 * Only providers with a connection are offered; there is no all-providers
 * view yet.
 */
export function ProviderControl({
  value,
  providers,
  onChange,
  status,
  actions,
}: {
  value: DiscoveryProvider | undefined;
  providers: DiscoveryProvider[];
  onChange: (p: DiscoveryProvider) => void;
  /** A short note beside the control: "Latest collected · …". */
  status?: string | null;
  /** Refresh, Back to Published. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id="discovery-provider-label" className="text-[13px] font-medium text-(--color-text-muted)">
        Provider
      </span>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as DiscoveryProvider)}>
        <SelectTrigger
          aria-labelledby="discovery-provider-label"
          title="Discovery shows one provider at a time. Only providers with a connection are listed."
          className="h-9 w-[230px] text-[13px] font-medium text-(--color-text) data-[size=default]:min-h-9"
        >
          <SelectValue placeholder="Choose a provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              <ProviderValue provider={p} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status ? (
        <span role="status" className="max-w-[260px] truncate text-xs text-(--color-text-muted)" title={status}>
          {status}
        </span>
      ) : null}
      {actions}
    </div>
  );
}
