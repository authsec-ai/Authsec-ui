import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { NODE_ICON } from "../../graph/icons";
import type { NodeCategory, NodeIcon } from "../../graph/nodeView";

/** Category colour, always with an icon and the kind in words (never colour alone). */
const CATEGORY_CHIP: Record<NodeCategory, string> = {
  workload: "bg-(--color-object-workload-soft) text-(--color-object-workload-text)",
  identity: "bg-(--color-object-identity-soft) text-(--color-object-identity-text)",
  resource: "bg-(--color-object-resource-soft) text-(--color-object-resource-text)",
  statement: "bg-(--color-object-statement-soft) text-(--color-object-statement-text)",
  external: "bg-(--color-object-external-soft) text-(--color-object-external-text)",
};

export function CategoryChip({
  category,
  icon,
  children,
  className,
}: {
  category: NodeCategory | null;
  icon: NodeIcon;
  /** The kind, in words. */
  children: ReactNode;
  className?: string;
}) {
  const Icon = NODE_ICON[icon];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4",
        category ? CATEGORY_CHIP[category] : "bg-(--color-surface-subtle) text-(--color-text-muted)",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
