/**
 * An Azure term that explains itself: hover or focus it and a short
 * explanation opens just above it in a small card (HoverExplain). The term
 * keeps its own look. A term the glossary does not know renders as plain text.
 */

import type { ReactNode } from "react";

import { HoverExplain } from "@/features/iga/shared/components/HoverExplain";
import { cn } from "@/lib/utils";

import { azureExplain } from "./azureGlossary";

/** `term` as text, explained on hover from the Azure glossary. `children` replaces the shown text when given. */
export function AzureTerm({ term, children, className }: { term: string; children?: ReactNode; className?: string }) {
  const text = azureExplain(term);
  const shown = children ?? term;
  if (!text) return <>{shown}</>;
  return (
    <HoverExplain title={term} text={text}>
      <span
        tabIndex={0}
        className={cn(
          "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)",
          className,
        )}
      >
        {shown}
      </span>
    </HoverExplain>
  );
}
