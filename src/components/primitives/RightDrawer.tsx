import React, { useState } from "react";
import { Pin, PinOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export interface RightDrawerProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  pinnable?: boolean;
  /** Accessible label for screen readers. Drawer content usually has its own
   *  visual heading; this is rendered visually hidden to satisfy Radix Dialog
   *  a11y. Defaults to a generic label so the primitive never warns. */
  ariaTitle?: string;
  ariaDescription?: string;
  children: React.ReactNode;
}

/**
 * RightDrawer — right-side panel using the Sheet component.
 *
 * Usage:
 *   <RightDrawer open={open} onClose={() => setOpen(false)} pinnable>
 *     ...content...
 *   </RightDrawer>
 */
export function RightDrawer({
  open,
  onClose,
  width = 520,
  pinnable = false,
  ariaTitle = "Detail panel",
  ariaDescription = "Side panel with additional details.",
  children,
}: RightDrawerProps) {
  const [pinned, setPinned] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        style={{ width }}
        className={cn(
          "flex flex-col gap-0 p-0 overflow-hidden",
          // When pinned: no overlay interaction closes it; handled via onInteractOutside
        )}
        onInteractOutside={(e) => {
          if (pinned) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={() => {
          if (pinned) {
            // allow close even when pinned (escape always works)
          }
        }}
      >
        <SheetTitle className="sr-only">{ariaTitle}</SheetTitle>
        <SheetDescription className="sr-only">{ariaDescription}</SheetDescription>
        {/* Custom header controls */}
        <div className="absolute top-3 right-3 flex items-center gap-1 z-50">
          {pinnable && (
            <button
              type="button"
              aria-label={pinned ? "Unpin panel" : "Pin panel open"}
              onClick={() => setPinned((prev) => !prev)}
              className={cn(
                "inline-flex items-center justify-center h-7 w-7 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                pinned && "opacity-100 text-blue-600"
              )}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
          )}
          {/* Custom close — always works regardless of pin */}
          <SheetClose asChild>
            <button
              type="button"
              aria-label="Close panel"
              className="inline-flex items-center justify-center h-7 w-7 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="size-4" />
            </button>
          </SheetClose>
        </div>

        {children}
      </SheetContent>
    </Sheet>
  );
}
