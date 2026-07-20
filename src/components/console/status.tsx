import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Token-driven status language shared across the console — StatusBadge chips
 * and the DecisionBanner verdict strip. Theme-aware (AA in light + dark);
 * never hardcode Tailwind palette colors for tones.
 */

export type ConsoleTone = "neutral" | "info" | "success" | "warning" | "danger";

export const toneClasses: Record<ConsoleTone, {
  chip: string;
  dot: string;
  banner: string;
  icon: string;
}> = {
  neutral: {
    chip: "border-(--color-border-subtle) bg-(--color-surface-subtle) text-(--color-text-muted)",
    dot: "bg-(--color-text-subtle)",
    banner: "border-(--color-border-subtle) bg-(--color-surface-raised)",
    icon: "text-(--color-text-muted)",
  },
  info: {
    chip: "border-transparent bg-(--color-info-soft) text-(--color-info-text)",
    dot: "bg-(--color-primary)",
    banner: "border-[color-mix(in_srgb,var(--color-primary)_24%,transparent)] bg-(--color-primary-soft)",
    icon: "text-(--color-info-text)",
  },
  success: {
    chip: "border-transparent bg-(--color-success-soft) text-(--color-success-text)",
    dot: "bg-(--color-success)",
    banner: "border-[color-mix(in_srgb,var(--color-success)_24%,transparent)] bg-(--color-success-soft)",
    icon: "text-(--color-success-text)",
  },
  warning: {
    chip: "border-transparent bg-(--color-warning-soft) text-(--color-warning-text)",
    dot: "bg-(--color-warning)",
    banner: "border-[color-mix(in_srgb,var(--color-warning)_24%,transparent)] bg-(--color-warning-soft)",
    icon: "text-(--color-warning-text)",
  },
  danger: {
    chip: "border-transparent bg-(--color-danger-soft) text-(--color-danger-text)",
    dot: "bg-(--color-danger)",
    banner: "border-[color-mix(in_srgb,var(--color-danger)_24%,transparent)] bg-(--color-danger-soft)",
    icon: "text-(--color-danger-text)",
  },
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: ConsoleTone;
  className?: string;
  title?: string;
}) {
  const t = toneClasses[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5",
        t.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function DecisionBanner({
  tone = "info",
  title,
  body,
  actionLabel,
  actionHref,
  onAction,
  actionDisabled,
  secondaryLabel,
  secondaryHref,
}: {
  tone?: ConsoleTone;
  title: ReactNode;
  body: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  const t = toneClasses[tone];
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? XCircle
        : tone === "warning"
          ? AlertTriangle
          : Circle;
  const primaryClass =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-(--color-primary) px-3.5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) disabled:pointer-events-none disabled:opacity-60";
  const action = actionLabel ? (
    actionHref ? (
      <Link
        to={actionHref}
        className={cn(primaryClass, actionDisabled && "pointer-events-none opacity-60")}
      >
        {actionLabel}
        <ArrowRight className="size-3.5" />
      </Link>
    ) : (
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className={primaryClass}
      >
        {actionLabel}
        <ArrowRight className="size-3.5" />
      </button>
    )
  ) : null;
  const secondary =
    secondaryLabel && secondaryHref ? (
      <Link
        to={secondaryHref}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3.5 text-sm font-semibold text-(--color-text) transition hover:bg-(--color-surface-subtle)"
      >
        {secondaryLabel}
      </Link>
    ) : null;

  return (
    <section
      className={cn(
        "flex min-h-[88px] items-center gap-4 rounded-lg border px-5 py-4",
        t.banner,
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", t.icon)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-6 text-(--color-text)">
          {title}
        </h2>
        <p className="mt-0.5 max-w-4xl text-sm leading-5 text-(--color-text-muted)">
          {body}
        </p>
      </div>
      {action || secondary ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {secondary}
          {action}
        </div>
      ) : null}
    </section>
  );
}
