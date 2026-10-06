/**
 * The IGA console's status badge: a neutral outline, a coloured dot, and a
 * label that is never truncated.
 *
 * The console-wide `StatusBadge` truncates its label inside `max-w-full`, so in
 * a table column narrower than the word it read "Unclassi…" / "Exact refere…"
 * (L-02). It also fills the whole pill with the tone, which made warning rows
 * look heavier than they are (A-04). Here the tone lives in the dot (and, for
 * danger, the text), the pill stays outlined, and the label is
 * `whitespace-nowrap` — the column gives way, not the word.
 *
 * IGA-scoped on purpose: `StatusBadge` is used by ~30 files outside IGA.
 */

import type { ReactNode } from "react";

import { toneClasses, type ConsoleTone } from "@/components/console/status";
import { cn } from "@/lib/utils";

export function IgaBadge({
  children,
  tone = "neutral",
  title,
  className,
}: {
  children: ReactNode;
  tone?: ConsoleTone;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-(--color-border-strong) bg-(--color-surface-raised) px-2 py-0.5 text-[11px] font-semibold leading-5",
        tone === "danger" ? "text-(--color-danger-text)" : "text-(--color-text)",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", toneClasses[tone].dot)} />
      {children}
    </span>
  );
}
