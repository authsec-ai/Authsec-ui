/**
 * The page evidence panel — "why does the product claim this?"
 * (SPEC-iga-phase2-graph.md §2.14.7 *The Evidence panel*, §5.3 *Evidence*)
 * — for tabs that are not a graph workspace. The graph tab shows the same
 * claims in its own inspector (`graph/GraphInspector.tsx`).
 *
 * One panel, never nested (§2.14.5): a link inside it navigates the page,
 * which closes it. Its header stays in view while the claims scroll; Escape
 * or Close returns focus to whatever opened it.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { useAnnounce } from "../shared/announce";
import { DeclaredAccessNotice, EvidenceClaims } from "./EvidenceClaim";
import { restoreEvidenceFocus, useEvidence } from "./useEvidence";

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Mounted by every graph page that is not a workspace; opens when the URL carries `evidence=`. */
export function EvidencePanel({ ws }: { ws: string }) {
  const { claims, isOpen, close } = useEvidence();
  const wide = useMediaQuery("(min-width: 1280px)");
  const narrow = useMediaQuery("(max-width: 767px)");
  useAnnounce(isOpen ? `Evidence opened for ${claims.length === 1 ? "one claim" : `${claims.length} claims`}` : null);

  const heading = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && wide) heading.current?.focus({ preventScroll: true });
    if (!isOpen && wasOpen.current) restoreEvidenceFocus();
    wasOpen.current = isOpen;
  }, [isOpen, wide]);
  useEffect(() => {
    if (!isOpen || !wide) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [isOpen, wide, close]);

  const content = (
    <div className="space-y-4 px-5 py-4">
      <DeclaredAccessNotice />
      <EvidenceClaims ws={ws} claims={claims} />
    </div>
  );

  if (wide)
    return isOpen ? (
      <aside
        aria-labelledby="evidence-heading"
        className="sticky top-4 flex max-h-[calc(100vh-6rem)] flex-col self-start overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--color-border-subtle) px-5 py-3">
          <h2 id="evidence-heading" ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">
            Evidence
          </h2>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close evidence">
            <X className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </aside>
    ) : null;

  return (
    <Sheet open={isOpen} modal={narrow} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent
        side="right"
        hideClose={narrow}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreEvidenceFocus();
        }}
        onInteractOutside={(event) => {
          if (!narrow) event.preventDefault();
        }}
        className={cn("gap-0 overflow-hidden", narrow ? "w-full max-w-none sm:max-w-none" : "w-[400px] sm:max-w-[400px]")}
      >
        <SheetHeader className="shrink-0 border-b px-5 py-3">
          {narrow ? (
            <Button variant="ghost" size="sm" onClick={close} className="w-fit">
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : null}
          <SheetTitle>Evidence</SheetTitle>
          <SheetDescription className="sr-only">Why the product shows this, and what it does not establish.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
