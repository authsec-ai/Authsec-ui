/**
 * A short explanation that opens just above an element on hover or focus: a
 * small card in the console's own surface colours (so it follows light and
 * dark), with the term in bold over the explanation. The element itself is the
 * trigger, so it keeps its own look and behaviour; with no text, the element
 * renders unchanged.
 */

import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/** A card above `children` with `title` (optional) over `text`. `children` must be one element (it is the trigger). */
export function HoverExplain({
  text,
  title,
  children,
  side = "top",
}: {
  text: string | undefined;
  /** The term being explained, shown in bold above the text. */
  title?: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  if (!text) return <>{children}</>;
  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={12}
            className={[
              "z-[120] w-72 max-w-[calc(100vw-24px)] rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-3.5 py-3 text-left normal-case tracking-normal",
              "shadow-[0_8px_24px_-6px_rgb(15_23_42/0.18),0_2px_6px_-2px_rgb(15_23_42/0.08)]",
              "origin-(--radix-tooltip-content-transform-origin) duration-150 ease-out",
              "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[side=top]:slide-in-from-bottom-1",
              "data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "motion-reduce:animate-none",
            ].join(" ")}
          >
            {title ? <p className="text-[13px] font-semibold leading-5 text-(--color-text)">{title}</p> : null}
            <p className={`text-xs font-normal leading-5 text-(--color-text-muted) ${title ? "mt-1" : ""}`}>{text}</p>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
