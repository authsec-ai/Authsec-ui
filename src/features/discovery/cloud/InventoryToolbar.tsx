/**
 * The Latest collected pages' filter row — one flat line over the table, not a
 * card of its own.
 *
 * Search takes the room; the chips that narrow by kind sit beside it; the
 * scope controls (a toggle, the account) sit at the right. A second line
 * appears only while something is narrowing the list: how many rows remain,
 * each filter removable, and Clear all. Every control is 32 px high, so the
 * row reads as one object rather than four differently sized ones.
 */

import type { ReactNode } from "react";
import { Check, Search, X } from "lucide-react";

import { AppliedFilters, type AppliedFilter } from "@/components/console/iam-console";
import { cn } from "@/lib/utils";

export function InventoryToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  chips,
  controls,
  applied,
  onClearAll,
  shown,
  total,
  noun,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Kind chips (`AWSFilterChips`), beside the search. */
  chips?: ReactNode;
  /** Toggles and the account picker, at the right. */
  controls?: ReactNode;
  applied: AppliedFilter[];
  onClearAll: () => void;
  /** Rows left after filtering, and rows loaded — said only while filtered. */
  shown: number;
  total: number;
  /** Plural, lower-case: "identities". */
  noun: string;
}) {
  const filtered = applied.length > 0 || search.trim().length > 0;
  return (
    <div className="space-y-2" role="search" aria-label={`Filter ${noun}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-md">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-4 text-(--color-text-muted)" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) onSearchChange("");
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) pl-8 pr-8 text-[13px] text-(--color-text) outline-none placeholder:text-(--color-text-subtle) focus-visible:border-(--color-primary) focus-visible:ring-2 focus-visible:ring-(--color-primary)/30"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 grid size-5 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        {chips ? <div className="min-w-0">{chips}</div> : null}
        {controls ? <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div> : null}
      </div>
      {filtered ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="tabular-nums text-(--color-text-muted)" role="status">
            {shown === total ? `All ${total} ${noun} match` : `${shown} of ${total} ${noun}`}
          </span>
          <AppliedFilters filters={applied} onClearAll={onClearAll} />
          {!applied.length ? (
            <button type="button" onClick={onClearAll} className="font-medium text-(--color-primary-text) hover:underline">
              Clear search
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** An on/off filter as a chip the same height as the rest of the row. */
export function FilterToggle({
  on,
  onChange,
  label,
  title,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  /** What turning it on shows. */
  title: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
        on
          ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-3.5 place-items-center rounded-sm border",
          on ? "border-(--color-primary) bg-(--color-primary) text-white" : "border-(--color-border-strong)",
        )}
      >
        {on ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      {label}
    </button>
  );
}
