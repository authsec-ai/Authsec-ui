/**
 * The Columns control for an `AdaptiveTable` with `sizing="fit"`: which
 * optional fields the customer wants as columns. The table still decides
 * what fits; a chosen field that does not fit is shown in each row's details,
 * and this menu says so.
 *
 * Preferences are column ids only — never row contents — kept per table and
 * per signed-in user and workspace, in this browser.
 */

import * as React from "react";
import { Columns3 } from "lucide-react";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "./adaptive-table";

export function ColumnsMenu<TData>({
  optional,
  chosen,
  onChange,
  onReset,
  layout,
}: {
  optional: AdaptiveColumn<TData>[];
  chosen: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
  /** What the table is doing with the choice right now. */
  layout?: AdaptiveColumnsLayout;
}) {
  const label = (c: AdaptiveColumn<TData>) => c.label ?? (typeof c.header === "string" ? c.header : c.id);
  const moved = layout?.inDetails ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" aria-label={`Columns${moved.length ? `, ${moved.length} in row details` : ""}`}>
          <Columns3 className="size-4" /> Columns
          {moved.length ? <span className="rounded bg-(--color-surface-subtle) px-1 text-[11px] tabular-nums">{moved.length} in details</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold text-(--color-text)">Show as columns</p>
        <ul className="space-y-1.5">
          {optional.map((c) => {
            const on = chosen.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(v) => onChange(v === true ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))}
                  />
                  <span className="min-w-0 flex-1 truncate">{label(c)}</span>
                  {on && moved.includes(c.id) ? <span className="text-[11px] text-(--color-text-muted)">in details</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-(--color-text-muted)">
          Fields that do not fit, or that are not chosen, are in each row's details.
        </p>
        <button type="button" onClick={onReset} className="mt-2 text-xs font-medium text-(--color-primary-text) hover:underline">
          Reset to default
        </button>
      </PopoverContent>
    </Popover>
  );
}
