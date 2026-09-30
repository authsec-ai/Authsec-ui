/**
 * One row of filter chips that never wraps into a second row.
 *
 * These pages filter by a kind whose option count is the estate's, not the
 * designer's: a workspace with fifteen resource types produced fifteen chips,
 * which wrapped to three rows and made the filter area taller than the first
 * page of results. The first few stay visible — they cover the common case —
 * and the tail goes behind one More control, which also carries the active
 * chip when the active one is in the tail, so the current filter is never
 * hidden from the reader.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ConsoleFilterOption } from "@/components/console/iam-console";
import { cn } from "@/lib/utils";

/** How many chips stay on the row. Six fits a ~1100px container beside the
 * More control without wrapping, and covers the common resource estates. */
const INLINE_MAX = 6;

const CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors";
const CHIP_ON = "border-transparent bg-(--color-primary-soft) font-semibold text-(--color-primary-text)";
const CHIP_OFF =
  "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)";

export function AWSFilterChips({
  options,
  active,
  onSelect,
  label,
}: {
  options: ConsoleFilterOption[];
  /** The key currently applied. */
  active: string;
  onSelect: (key: string) => void;
  /** Names the group for assistive tech, e.g. "Resource type". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!options.length) return null;

  let inline = options.slice(0, INLINE_MAX);
  let overflow = options.slice(INLINE_MAX);

  // Keep the applied filter on the row. Swapping it with the last inline chip
  // rather than appending avoids growing the row, and means the reader can
  // always see what is narrowing the list without opening anything.
  const activeInOverflow = overflow.find((o) => o.key === active);
  if (activeInOverflow) {
    inline = [...inline.slice(0, INLINE_MAX - 1), activeInOverflow];
    overflow = options.slice(INLINE_MAX - 1).filter((o) => o.key !== active);
  }

  const chip = (o: ConsoleFilterOption) => (
    <button
      key={o.key}
      type="button"
      onClick={() => onSelect(o.key)}
      aria-pressed={active === o.key}
      className={cn(CHIP_BASE, active === o.key ? CHIP_ON : CHIP_OFF)}
    >
      <span className="truncate">{o.label}</span>
      {o.count !== undefined ? <span className="tabular-nums opacity-70">{o.count}</span> : null}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 overflow-hidden" role="group" aria-label={label}>
      {inline.map(chip)}

      {overflow.length ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={cn(CHIP_BASE, CHIP_OFF)}>
              More
              <ChevronDown className="size-3" aria-hidden />
              <span className="tabular-nums opacity-70">{overflow.length}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1.5">
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {overflow.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    onSelect(o.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs",
                    active === o.key
                      ? "bg-(--color-primary-soft) font-semibold text-(--color-primary-text)"
                      : "text-(--color-text) hover:bg-(--color-surface-subtle)",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.count !== undefined ? (
                    <span className="tabular-nums text-(--color-text-muted)">{o.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
