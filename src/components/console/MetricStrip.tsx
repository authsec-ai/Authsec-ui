import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type MetricTone = "neutral" | "primary" | "success" | "warning" | "danger";

export interface MetricStripItemDef {
  key: string;
  label: string;
  value: number | string;
  tone?: MetricTone;
  onClick?: () => void;
}

const DOT_TONE_CLASS: Record<MetricTone, string> = {
  neutral: "bg-(--color-text-subtle)",
  primary: "bg-(--color-primary)",
  success: "bg-(--color-success)",
  warning: "bg-(--color-warning)",
  danger: "bg-(--color-danger)",
};

function MetricStripSegment({ label, value, tone = "neutral", onClick }: Omit<MetricStripItemDef, "key">) {
  return (
    // Value over label, not beside it. Side by side at 22px and 14px they read
    // as one sentence of roughly equal weight, so four tiles looked alike and
    // none of the numbers stood out — which is the whole job of a metric strip.
    // Stacked, the number leads and the label explains it.
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-start gap-1 px-5 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)",
        onClick ? "hover:bg-(--color-hover)" : "cursor-default",
      )}
    >
      <span
        className={cn(
          "text-[26px] leading-none font-semibold tracking-tight tabular-nums",
          value === 0 ? "text-(--color-text-subtle)" : "text-(--color-text)",
        )}
      >
        {value}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
        <span className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT_TONE_CLASS[tone])} />
        {label}
      </span>
    </button>
  );
}

interface MetricStripProps extends Omit<ComponentPropsWithoutRef<"div">, "className"> {
  items: MetricStripItemDef[];
  className?: string;
}

/** A single divided card of dot+value+label segments — the "Launchpad" metric strip. */
export function MetricStrip({ items, className, ...rest }: MetricStripProps) {
  return (
    <Card
      className={cn("flex-row divide-x divide-(--color-border-subtle) overflow-hidden", className)}
      {...rest}
    >
      {/* `key` is pulled out of the spread rather than being overwritten by it:
          spreading an object that carries `key` after an explicit one is a
          TS2783, and React strips the prop anyway. */}
      {items.map(({ key, ...item }) => (
        <MetricStripSegment key={key} {...item} />
      ))}
    </Card>
  );
}
