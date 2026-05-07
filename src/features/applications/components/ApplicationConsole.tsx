import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReadinessState } from "../types";

export const consolePage =
  "mx-auto w-full max-w-[1280px] space-y-5 px-8 py-7";

export const surface =
  "rounded-lg border border-slate-200 bg-white shadow-[0_1px_1px_rgba(15,23,42,0.02)]";

export type ConsoleTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<ConsoleTone, {
  chip: string;
  dot: string;
  banner: string;
  icon: string;
}> = {
  neutral: {
    chip: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-400",
    banner: "border-slate-200 bg-white",
    icon: "text-slate-500",
  },
  info: {
    chip: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-600",
    banner: "border-blue-200 bg-blue-50",
    icon: "text-blue-600",
  },
  success: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-600",
    banner: "border-emerald-200 bg-emerald-50",
    icon: "text-emerald-600",
  },
  warning: {
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    banner: "border-amber-200 bg-amber-50",
    icon: "text-amber-600",
  },
  danger: {
    chip: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-600",
    banner: "border-red-200 bg-red-50",
    icon: "text-red-600",
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
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {actionLabel}
        <ArrowRight className="size-3.5" />
      </Link>
    ) : (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
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
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-white/70", t.icon)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-6 text-slate-950">
          {title}
        </h2>
        <p className="mt-0.5 max-w-4xl text-sm leading-5 text-slate-600">
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
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[24px] font-semibold leading-8 tracking-normal text-slate-950">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
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
      <span className="text-sm font-semibold text-slate-950">{value}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}
