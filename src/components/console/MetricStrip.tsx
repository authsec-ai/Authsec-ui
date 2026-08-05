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

function MetricStripSegment({ label, value, tone = "neutral", onClick }: MetricStripItemDef) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center gap-3 px-5 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)",
        onClick ? "hover:bg-(--color-hover)" : "cursor-default",
      )}
    >
      <span className={cn("h-2 w-2 flex-none rounded-full", DOT_TONE_CLASS[tone])} />
      <span
        className={cn(
          "text-[22px] leading-none font-semibold tracking-tight tabular-nums",
          value === 0 ? "text-(--color-text-subtle)" : "text-(--color-text)",
        )}
      >
        {value}
      </span>
      <span className="text-sm text-(--color-text-muted)">{label}</span>
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
      {items.map((item) => (
        <MetricStripSegment key={item.key} {...item} />
      ))}
    </Card>
  );
}
