import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GraphFacetValue } from "@/app/api/igaGraphApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const ALL = "all";

/**
 * One filter whose options and counts come from the server's facets, so a
 * choice shows what it would give under every other active filter (§5.2).
 * A selected value the facets no longer list stays selectable, so the control
 * never silently shows "All" while a filter is applied.
 */
export function FacetSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  labelFor,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: GraphFacetValue[];
  onChange: (value: string | null) => void;
  /** Console wording for a value, when it differs from the server's label. */
  labelFor?: (value: string, serverLabel: string) => string;
}) {
  const v = value ?? ALL;
  const listed = v === ALL || options.some((o) => o.value === v);
  const name = (o: GraphFacetValue) => (labelFor ? labelFor(o.value, o.label) : o.label);
  return (
    <Select value={v} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger className="h-9 w-[170px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {name(o)} <span className="ml-1 tabular-nums text-(--color-text-muted)">{o.count}</span>
          </SelectItem>
        ))}
        {!listed ? (
          <SelectItem value={v}>
            {labelFor ? labelFor(v, v) : v} <span className="ml-1 tabular-nums text-(--color-text-muted)">0</span>
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

/** Sort choice for a graph list; the server sorts, never the loaded page. */
export function SortSelect<S extends string>({
  value,
  options,
  onChange,
}: {
  value: S;
  options: { value: S; label: string }[];
  onChange: (value: S) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as S)}>
      <SelectTrigger className="h-9 w-[160px]" aria-label="Sort">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Repeated account URL parameters are ORed by the server; zero selections means all. */
export function MultiFacetSelect({ label, allLabel, value, options, onChange, labelFor }: {
  label: string; allLabel: string; value: string[]; options: GraphFacetValue[];
  onChange: (values: string[]) => void; labelFor?: (value: string, serverLabel: string) => string;
}) {
  const all = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v, count: 0 }))];
  const name = (v: string) => { const raw = all.find((o) => o.value === v)?.label ?? v; return labelFor?.(v, raw) ?? raw; };
  return <Popover>
    <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 max-w-64" aria-label={`${label}: ${value.length ? value.map(name).join(", ") : allLabel}`}>
      <span className="truncate">{!value.length ? allLabel : value.length === 1 ? name(value[0]) : `${value.length} accounts`}</span>
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 p-2">
      <p className="px-2 py-1 text-sm font-semibold">{label}</p>
      <button className="px-2 py-1 text-sm text-(--color-primary-text) underline" onClick={() => onChange([])}>All accounts</button>
      <div className="max-h-72 overflow-auto">
        {all.map((o) => <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-(--color-surface-subtle)">
          <input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))} />
          <span className="min-w-0 flex-1 break-words">{name(o.value)}</span><span className="text-(--color-text-muted)">{o.count}</span>
        </label>)}
        {!all.length ? <p className="p-2 text-xs text-(--color-text-muted)">No account options reported.</p> : null}
      </div>
    </PopoverContent>
  </Popover>;
}
