import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerPrevNextProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
}

/**
 * DrawerPrevNext — prev/next navigation control for cycling through a list in a drawer.
 *
 * Usage:
 *   <DrawerPrevNext
 *     onPrev={() => setIndex(i - 1)}
 *     onNext={() => setIndex(i + 1)}
 *     hasPrev={i > 0}
 *     hasNext={i < total - 1}
 *     currentIndex={i}
 *     total={total}
 *   />
 */
export function DrawerPrevNext({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  total,
}: DrawerPrevNextProps) {
  // Belt-and-suspenders against callers passing undefined/NaN. The actual fix
  // is at the call site (e.g. handleSelectRow in EndUsersPage falling back to
  // a linear lookup), but in-progress UI loads can briefly hand us NaN — and
  // "NaN of 1" in the pager is a worse first impression than rendering "1 of 1"
  // for the half-second before state settles.
  const safeIndex = Number.isFinite(currentIndex) ? currentIndex : 0;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous item"
        onClick={onPrev}
        disabled={!hasPrev}
        className={cn(
          "inline-flex items-center justify-center h-6 w-6 rounded-sm transition-colors",
          "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs text-slate-500 select-none tabular-nums">
        {safeIndex + 1} of {safeTotal}
      </span>
      <button
        type="button"
        aria-label="Next item"
        onClick={onNext}
        disabled={!hasNext}
        className={cn(
          "inline-flex items-center justify-center h-6 w-6 rounded-sm transition-colors",
          "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
