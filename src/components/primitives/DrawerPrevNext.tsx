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
        {currentIndex + 1} of {total}
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
