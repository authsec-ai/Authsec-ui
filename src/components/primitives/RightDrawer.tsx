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
  /**
   * Panel width in pixels. Now actually applied — see the `style` on
   * SheetContent below for why it previously was not.
   *
   * The default is 384 rather than a rounder number because 384px
   * (`sm:max-w-sm`) is what EVERY drawer in this app has really been
   * rendering at, whatever it asked for. Keeping it as the default means
   * fixing the cap does not silently re-lay-out the four screens that never
   * specified a width (Discovered Agents, Certification, Provenance, Service
   * Accounts) — they render exactly as before. Only callers that explicitly
   * pass a width see a change, which is what passing one was always meant to
   * do.
   */
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
  width = 384,
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
        hideClose
        /**
         * `maxWidth` is the load-bearing half of this.
         *
         * SheetContent's own side="right" classes include `sm:max-w-sm` —
         * max-width: 24rem, i.e. 384px. An inline `width` does not defeat a
         * max-width, so every drawer in this app rendered at 384px no matter
         * what it passed: 560 here, 640 there, all clamped, silently. The
         * visible symptom was a footer whose actions ran off the right edge
         * and were cut off by `overflow-hidden` — the Revoke button on the AWS
         * connector drawer sat outside the panel entirely and could not be
         * clicked.
         *
         * An inline max-width beats the utility class, so setting it here is
         * what lets `width` mean anything. 100vw rather than `none` so a 640px
         * panel on a narrow phone still fits the screen instead of forcing the
         * page to scroll sideways.
         */
        style={{ width, maxWidth: "100vw" }}
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
