import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SetupStepState = "active" | "done" | "todo";

export function SetupStep({
  number,
  title,
  state,
  summary,
  onEdit,
  children,
}: {
  number: number;
  title: ReactNode;
  state: SetupStepState;
  /** Shown in place of children when state="done" and the step is collapsed. */
  summary?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
}) {
  const collapsed = state === "done";
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 p-5 transition",
        state === "active" &&
          "border-[var(--color-primary)] shadow-[0_0_0_1px_var(--color-primary)]",
        state === "done" && "bg-[color:color-mix(in_oklch,var(--color-success)_4%,transparent)]",
      )}
    >
      <header className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            state === "done"
              ? "bg-emerald-600 text-white"
              : state === "active"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-slate-200 text-slate-700",
          )}
        >
          {state === "done" ? <Check className="size-4" /> : number}
        </span>
        <h3 className="flex-1 text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {collapsed && onEdit ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
      </header>

      {collapsed && summary ? (
        <div className="text-sm text-muted-foreground">{summary}</div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </Card>
  );
}

export default SetupStep;
