/**
 * `ReadinessGate` — a single row in the Overview's "Launch readiness map".
 *
 * Numbered circle + label + status chip + one-line reason + chevron.
 * Click anywhere on the row to jump to the gate's detail tab.
 */

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessArea, ReadinessState } from "../types";

export interface ReadinessGateProps {
  step: number;
  label: string;
  area: ReadinessArea;
  /** Tab path to navigate to, e.g. "setup", "tools". */
  tab: string;
  applicationId: string;
  /** Show a hairline divider above this gate. */
  withDivider?: boolean;
  className?: string;
}

const TONE: Record<
  ReadinessState,
  { circleBg: string; circleBorder: string; chip: string; chipText: string; label: string }
> = {
  ok: {
    circleBg: "bg-[color:color-mix(in_oklch,var(--color-success)_12%,transparent)]",
    circleBorder: "border-[var(--color-success)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)]",
    chipText: "text-[var(--color-success)]",
    label: "Passing",
  },
  warn: {
    circleBg: "bg-[color:color-mix(in_oklch,var(--color-warning)_12%,transparent)]",
    circleBorder: "border-[var(--color-warning)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_10%,transparent)]",
    chipText: "text-[var(--color-warning)]",
    label: "Needs work",
  },
  err: {
    circleBg: "bg-[color:color-mix(in_oklch,var(--color-danger)_12%,transparent)]",
    circleBorder: "border-[var(--color-danger)]",
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_10%,transparent)]",
    chipText: "text-[var(--color-danger)]",
    label: "Blocked",
  },
  none: {
    circleBg: "bg-muted",
    circleBorder: "border-border",
    chip: "border-border bg-muted",
    chipText: "text-muted-foreground",
    label: "—",
  },
};

export function ReadinessGate({
  step,
  label,
  area,
  tab,
  applicationId,
  withDivider,
  className,
}: ReadinessGateProps) {
  const tone = TONE[area.state];
  return (
    <Link
      to={`/applications/${applicationId}/${tab}`}
      data-slot="readiness-gate"
      className={cn(
        "group flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30",
        withDivider && "border-t border-border",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
          tone.circleBg,
          tone.circleBorder,
          tone.chipText,
        )}
        aria-hidden
      >
        {step}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-3">
          <span className="truncate text-sm font-semibold text-foreground">
            {label}
          </span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
              tone.chip,
              tone.chipText,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {area.status}
          </span>
        </span>
        {area.detail && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {area.detail}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden
        className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
