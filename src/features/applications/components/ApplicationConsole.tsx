import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReadinessState } from "../types";

export const consolePage =
  "mx-auto w-full max-w-[1280px] space-y-5 px-8 py-7";

export const surface =
  "rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) shadow-(--shadow-xs)";

export type ConsoleTone = "neutral" | "info" | "success" | "warning" | "danger";

// Token-driven tone language shared with the unified StatusBadge — theme-aware
// (AA in light + dark) instead of hardcoded slate/blue Tailwind colors.
const toneClasses: Record<ConsoleTone, {
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

export function toneFromReadiness(state: ReadinessState): ConsoleTone {
  if (state === "ok") return "success";
  if (state === "warn") return "warning";
  if (state === "err") return "danger";
  return "neutral";
}

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
}: {
  tone?: ConsoleTone;
  title: ReactNode;
  body: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
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
  const action = actionLabel ? (
    actionHref ? (
      <Link
        to={actionHref}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-(--color-primary) px-3.5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong)"
      >
        {actionLabel}
        <ArrowRight className="size-3.5" />
      </Link>
    ) : (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-(--color-primary) px-3.5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong)"
      >
        {actionLabel}
        <ArrowRight className="size-3.5" />
      </button>
    )
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
      {action}
    </section>
  );
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
