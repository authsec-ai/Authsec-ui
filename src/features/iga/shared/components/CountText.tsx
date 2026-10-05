/**
 * A count in one of its four distinct states (see `countValue.ts`). Used by
 * every count on the Discovery screen — the type switcher, facet options, the
 * previews — so an exact number, a lower bound, an unavailable count and a
 * true zero never look alike.
 */

import { cn } from "@/lib/utils";

import { countWords, type CountValue } from "./countValue";

export function CountText({ count, className }: { count: CountValue; className?: string }) {
  switch (count.kind) {
    case "loading":
      return (
        <span className={cn("tabular-nums text-(--color-text-subtle)", className)} aria-busy="true">
          <span aria-hidden="true">…</span>
          <span className="sr-only">Loading</span>
        </span>
      );
    case "unavailable":
      return (
        <span
          className={cn("text-(--color-text-muted)", className)}
          title="The count timed out or the provider does not report it. This is not zero."
        >
          Unavailable
        </span>
      );
    case "at_least":
      return (
        <span className={cn("tabular-nums", className)} title="A lower bound: the list is capped or the read was partial.">
          {countWords(count)}
        </span>
      );
    case "exact":
      return <span className={cn("tabular-nums", className)}>{countWords(count)}</span>;
  }
}
