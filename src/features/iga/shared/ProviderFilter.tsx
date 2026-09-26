import { ConsoleFilterField } from "@/components/console/iam-console";

import { PROVIDER_FILTER_VALUES, PROVIDER_LABEL } from "./providers";

/**
 * Shown only when graph v2 is available. Unset keeps the default AWS list URL.
 * "All providers" is a real opt-in (`graph=v2` with no provider), so this is
 * not the facet select whose "all" means unset.
 */
export function ProviderFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | null) => void;
}) {
  return (
    <ConsoleFilterField label="Provider">
      <select
        aria-label="Provider"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-9 w-full rounded-md border border-(--color-border-subtle) bg-(--color-surface) px-2 text-sm"
      >
        <option value="">Current graph</option>
        {PROVIDER_FILTER_VALUES.map((provider) => (
          <option key={provider} value={provider}>
            {PROVIDER_LABEL[provider]}
          </option>
        ))}
      </select>
    </ConsoleFilterField>
  );
}
