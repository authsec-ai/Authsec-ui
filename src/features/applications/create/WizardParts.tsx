/**
 * Inline status notice shared by the Add MCP page sections. Colors come from
 * theme tokens only.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type NoticeTone = "success" | "danger" | "warning" | "info" | "loading";

const NOTICE_TONE: Record<NoticeTone, string> = {
  success:
    "border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-(--color-success-soft) text-(--color-success-text)",
  danger:
    "border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-(--color-danger-soft) text-(--color-danger-text)",
  warning:
    "border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-(--color-warning-soft) text-(--color-warning-text)",
  info: "border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)] bg-(--color-info-soft) text-(--color-info-text)",
  loading: "border-border bg-muted text-foreground",
};

const NOTICE_ICON: Record<NoticeTone, ReactNode> = {
  success: <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />,
  danger: <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />,
  warning: <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />,
  info: <Info className="mt-0.5 size-4 shrink-0" aria-hidden />,
  loading: <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />,
};

export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-start gap-2.5 rounded-lg border px-4 py-3 text-[length:var(--font-size-sm)] leading-relaxed",
        NOTICE_TONE[tone],
      )}
    >
      {NOTICE_ICON[tone]}
      <div className="min-w-0 flex-1">
        {title ? <span className="font-semibold">{title} </span> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
