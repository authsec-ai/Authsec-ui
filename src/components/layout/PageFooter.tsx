/**
 * PageFooter — a page's action bar, rendered beneath the scrolling content.
 *
 * A layout that offers a footer slot (IgaLayout) renders it below its scroll
 * area, in the column, so the bar is always at the bottom of the window, never
 * covers the content, and spans the content area without negative-margin
 * guesses about the page's padding. Inside a layout without the slot the bar
 * falls back to sticking to the bottom of the scroll area.
 *
 * Why not `sticky` inside the page: a sticky bar is three containers deep in a
 * width-capped, padded column. Its full-bleed look depended on margins that
 * mirror that padding, and it moved whenever anything scrolled a container
 * above it, leaving a blank band under it.
 */

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** The element a layout's footer slot renders into; null while it mounts. */
export const PageFooterSlotContext = createContext<HTMLElement | null>(null);

export function PageFooter({ children, className }: { children: ReactNode; className?: string }) {
  const slot = useContext(PageFooterSlotContext);
  // Aligned with the page column above it (ConsolePage: --console-max-width,
  // 32px gutters), so the bar's text and buttons line up with the form.
  const inner = (
    <div className={cn("mx-auto w-full max-w-(--console-max-width,1280px) px-8 py-3", className)}>{children}</div>
  );
  if (slot) return createPortal(inner, slot);
  return (
    <div className="sticky bottom-0 z-10 border-t border-(--color-border-subtle) bg-(--color-surface-raised)">{inner}</div>
  );
}
