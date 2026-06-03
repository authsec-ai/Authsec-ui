import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Unified status-tone language for the AuthSec console (Console Refresh).
 * One pill + leading dot, tone-driven. Shared across Applications readiness/
 * risk, Roles risk, and Dashboard status rows. Mirrors the prototype `.badge`.
 */
export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent"
  | "muted";

const toneStyles: Record<
  StatusTone,
  { container: string; dot: string }
> = {
  success: {
    container: "bg-(--color-success-soft) text-(--color-success-text)",
    dot: "bg-(--color-success)",
  },
  warning: {
    container: "bg-(--color-warning-soft) text-(--color-warning-text)",
    dot: "bg-(--color-warning)",
  },
  danger: {
    container: "bg-(--color-danger-soft) text-(--color-danger-text)",
    dot: "bg-(--color-danger)",
  },
  info: {
    container: "bg-(--color-info-soft) text-(--color-info-text)",
    dot: "bg-(--color-primary)",
  },
  accent: {
    container: "bg-(--color-primary-soft) text-(--color-primary-text)",
    dot: "bg-(--color-primary)",
  },
  muted: {
    container:
      "bg-(--color-surface-subtle) text-(--color-text-muted) border-(--color-border-subtle)",
    dot: "bg-(--color-text-subtle)",
  },
};

interface StatusBadgeProps extends React.ComponentProps<"span"> {
  tone?: StatusTone;
  /** Show the leading status dot. Defaults to true. */
  dot?: boolean;
}

export function StatusBadge({
  tone = "muted",
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const styles = toneStyles[tone];
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent pr-2.5 pl-2.25 text-[12.5px] font-semibold tracking-[-0.005em]",
        styles.container,
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
      )}
      {children}
    </span>
  );
}
