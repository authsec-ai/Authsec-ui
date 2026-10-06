/**
 * A quiet (i) beside a heading or label that holds the explanation a reader
 * needs once, not on every visit: caveats, definitions, how a number is made.
 * Keyboard reachable, named for screen readers, and drawn in the console's
 * own ink rather than a brand colour.
 */

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

export function InfoTip({
  children,
  label = "More information",
  side = "top",
  className,
}: {
  children: ReactNode;
  /** What the button is called for a screen reader. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-grid size-5 shrink-0 place-items-center rounded text-(--color-text-muted) transition-colors hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-primary)",
              className,
            )}
          >
            <Info className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-[120] max-w-xs rounded-md bg-slate-900 px-3 py-2 text-xs font-normal leading-5 text-white shadow-[0_4px_16px_rgb(15_23_42/0.16)]"
          >
            {children}
            <TooltipPrimitive.Arrow className="fill-slate-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
