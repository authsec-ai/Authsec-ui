import { HelpTooltip } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ProviderGlyph } from "../shared/components/ProviderGlyph";
import { PROVIDER_LABEL, type DiscoveryProvider } from "./urlState";

/**
 * Which provider Discovery shows. Only providers that have a connection are
 * offered; the control says that there is no all-providers view yet.
 */
export function ProviderControl({
  value,
  providers,
  onChange,
}: {
  value: DiscoveryProvider | undefined;
  providers: DiscoveryProvider[];
  onChange: (p: DiscoveryProvider) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-(--color-text-muted)">Provider</span>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as DiscoveryProvider)}>
        <SelectTrigger className="h-9 w-[170px]" aria-label="Provider">
          <SelectValue placeholder="Choose a provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              <span className="inline-flex items-center gap-2">
                <ProviderGlyph provider={p} />
                {PROVIDER_LABEL[p]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <HelpTooltip content="Discovery shows one provider at a time. There is no all-providers view yet. Only providers with a connection are listed." side="bottom" />
    </div>
  );
}
