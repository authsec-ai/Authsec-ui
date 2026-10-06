/**
 * Discovery's filter row: popover facets, not a permanent rail — a rail and a
 * preview must never squeeze the same table. Below 900 px of content width the
 * row collapses into one Filters sheet (SPEC-console-revamp.md *Layout*).
 *
 * Every option shows its count in one of the four count states. Options and
 * counts come from the server's facets, which reflect every other active
 * filter; a facet whose count timed out says Unavailable, never 0.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

import { AppliedFilters, type AppliedFilter } from "@/components/console/iam-console";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { CountText } from "../shared/components/CountText";
import type { CountValue } from "../shared/components/countValue";

export interface FacetOption {
  value: string;
  label: string;
  /** Absent: this facet does not report counts. */
  count?: CountValue;
}

export interface FacetSpec {
  key: string;
  label: string;
  kind: "choice" | "toggle";
  /** choice: the selected option's value; toggle: "1" when on. */
  value?: string;
  options?: FacetOption[];
  /** The facet's counts timed out: every option says Unavailable. */
  countsUnavailable?: boolean;
  anyLabel?: string;
  onChange: (value: string | undefined) => void;
  /** One sentence that belongs with the facet: "The three values are mutually exclusive." */
  note?: ReactNode;
  /** Why the facet cannot be used right now. */
  disabledReason?: string;
  /** The facet filters the rows already loaded, not the server's answer, and says so. */
  loadedOnly?: boolean;
}

/** Below this content width the facets collapse into one sheet. */
export const FACET_SHEET_BELOW = 900;

function selectedLabel(f: FacetSpec): string | undefined {
  if (f.value === undefined) return undefined;
  if (f.kind === "toggle") return f.label;
  return f.options?.find((o) => o.value === f.value)?.label ?? f.value;
}

function Choice({ facet, onPicked }: { facet: FacetSpec; onPicked?: () => void }) {
  const name = useId();
  const options = facet.options ?? [];
  const all: FacetOption[] = facet.value && !options.some((o) => o.value === facet.value) ? [...options, { value: facet.value, label: facet.value }] : options;
  const pick = (v: string | undefined) => {
    facet.onChange(v);
    onPicked?.();
  };
  return (
    <fieldset className="space-y-1" disabled={!!facet.disabledReason}>
      <legend className="text-xs font-medium text-(--color-text-muted)">{facet.label}</legend>
      {facet.note ? <p className="text-xs text-(--color-text-muted)">{facet.note}</p> : null}
      {facet.disabledReason ? <p className="text-xs text-(--color-text-muted)">{facet.disabledReason}</p> : null}
      {facet.loadedOnly ? <p className="text-xs text-(--color-text-muted)">Filters the loaded rows. Counts are of those rows.</p> : null}
      <div className="max-h-64 overflow-y-auto rounded-md border border-(--color-border-subtle)">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--color-surface-subtle) has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-(--color-primary)">
          <input type="radio" name={name} checked={facet.value === undefined} onChange={() => pick(undefined)} />
          <span className="min-w-0 flex-1">{facet.anyLabel ?? "Any"}</span>
        </label>
        {all.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--color-surface-subtle) has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-(--color-primary)"
          >
            <input type="radio" name={name} checked={facet.value === o.value} onChange={() => pick(o.value)} />
            <span className="min-w-0 flex-1 break-words">{o.label}</span>
            {facet.countsUnavailable ? (
              <CountText count={{ kind: "unavailable" }} className="text-xs" />
            ) : o.count ? (
              <CountText count={o.count} className="text-xs text-(--color-text-muted)" />
            ) : null}
          </label>
        ))}
        {!all.length ? <p className="p-2 text-xs text-(--color-text-muted)">{facet.countsUnavailable ? "Options unavailable — the count timed out." : "None reported."}</p> : null}
      </div>
    </fieldset>
  );
}

function FacetPopover({ facet }: { facet: FacetSpec }) {
  const [open, setOpen] = useState(false);
  const chosen = selectedLabel(facet);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5", chosen && "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary-text)")}
          aria-label={chosen ? `${facet.label}: ${chosen}` : facet.label}
        >
          <span className="max-w-48 truncate">{chosen ? `${facet.label}: ${chosen}` : facet.label}</span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        <Choice facet={facet} onPicked={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function Toggle({ facet }: { facet: FacetSpec }) {
  const on = facet.value !== undefined;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => facet.onChange(on ? undefined : "1")}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
        on
          ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary-text)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
      )}
    >
      {facet.label}
    </button>
  );
}

export function FacetBar({
  facets,
  width,
  removed,
  onDismissRemoved,
  onClearAll,
  part = "all",
}: {
  facets: FacetSpec[];
  /** The screen's measured content width (0 until measured). */
  width: number;
  removed: { key: string; label: string; reason: string }[];
  onDismissRemoved: () => void;
  onClearAll: () => void;
  /**
   * "button": only a "More filters" button and its sheet, for a one-row
   * toolbar (the 2026-10-06 Discovery design). "status": only what is applied
   * or was removed, for the line under that toolbar. "all": both, as before.
   */
  part?: "all" | "button" | "status";
}) {
  const [sheet, setSheet] = useState(false);
  const active = facets.filter((f) => f.value !== undefined);
  const applied: AppliedFilter[] = active.map((f) => ({
    key: f.key,
    label: f.kind === "toggle" ? f.label : `${f.label}: ${selectedLabel(f)}`,
    onRemove: () => f.onChange(undefined),
  }));
  const collapsed = part === "button" || (width > 0 && width < FACET_SHEET_BELOW);
  const controls = part !== "status";
  const status = part !== "button";

  return (
    <div className={part === "button" ? "contents" : "space-y-2"}>
      {controls && facets.length ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          {collapsed ? (
            <Button variant="outline" size="sm" className={part === "button" ? "h-9" : "h-8"} onClick={() => setSheet(true)} aria-label={active.length ? `Filters, ${active.length} applied` : "Filters"}>
              <SlidersHorizontal aria-hidden="true" className="size-4" /> Filters
              {active.length ? (
                <span className="rounded bg-(--color-primary-soft) px-1.5 text-[11px] font-semibold tabular-nums text-(--color-primary-text)">{active.length}</span>
              ) : null}
            </Button>
          ) : (
            facets.map((f) => (f.kind === "toggle" ? <Toggle key={f.key} facet={f} /> : <FacetPopover key={f.key} facet={f} />))
          )}
        </div>
      ) : null}

      {status && removed.length ? (
        <div className="flex flex-wrap items-center gap-1.5" role="status" aria-label="Filters removed by the last switch">
          {removed.map((r) => (
            <span
              key={r.key}
              className="inline-flex min-h-7 items-center gap-1 rounded-md border border-(--color-border-subtle) bg-(--color-warning-soft) px-2 text-xs text-(--color-warning-text)"
            >
              Removed: {r.label} — {r.reason}
              <button
                type="button"
                onClick={onDismissRemoved}
                aria-label={`Dismiss: removed ${r.label}`}
                className="grid size-5 place-items-center rounded hover:bg-(--color-surface-raised)"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {status ? <AppliedFilters filters={applied} onClearAll={onClearAll} /> : null}

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[380px]">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow this list. Counts reflect every other filter in force.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {facets.map((f) =>
              f.kind === "toggle" ? (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.value !== undefined} onChange={(e) => f.onChange(e.target.checked ? "1" : undefined)} />
                  {f.label}
                </label>
              ) : (
                <Choice key={f.key} facet={f} />
              ),
            )}
          </div>
          <SheetFooter className="shrink-0 flex-row justify-between border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={onClearAll} disabled={!active.length}>
              Clear all
            </Button>
            <Button size="sm" className="text-[length:var(--font-size-sm)] text-white" onClick={() => setSheet(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
