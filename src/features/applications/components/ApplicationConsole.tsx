import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { toneClasses, type ConsoleTone } from "@/components/console/status";
import type { ReadinessState } from "../types";

// The token-driven tone primitives (StatusBadge, DecisionBanner) are shared
// console-wide — they live in @/components/console/status and are re-exported
// here so existing application-feature imports keep working.
export { StatusBadge, DecisionBanner, toneClasses } from "@/components/console/status";
export type { ConsoleTone } from "@/components/console/status";

export const consolePage =
  "mx-auto w-full max-w-(--console-max-width) space-y-5 px-8 py-7";

export const surface =
  "rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) shadow-(--shadow-xs)";

export function toneFromReadiness(state: ReadinessState): ConsoleTone {
  if (state === "ok") return "success";
  if (state === "warn") return "warning";
  if (state === "err") return "danger";
  return "neutral";
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.04em] text-(--color-text-subtle)">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.02em] text-(--color-text)">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-5 text-(--color-text-muted)">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn(surface, className)}>{children}</section>;
}

export function InlineStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: ConsoleTone;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-1.5 rounded-full", toneClasses[tone].dot)} />
      <span className="text-sm font-semibold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
