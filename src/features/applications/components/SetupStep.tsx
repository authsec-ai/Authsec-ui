import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  /** Shown inline in the header row when state="done". */
  summary?: ReactNode;
  onEdit?: () => void;
  children: ReactNode;
}) {
  const collapsed = state === "done";

  return (
    <div
      className={cn(
        // Base surface
        "rounded-lg border bg-white transition",
        // Active: left accent + slightly elevated shadow
        state === "active" && [
          "border-slate-200 border-l-[3px] border-l-blue-600",
          "shadow-[0_1px_4px_rgba(15,23,42,0.06)]",
        ],
        // Done: emerald left accent + flat shadow
        state === "done" && [
          "border-slate-200 border-l-[3px] border-l-emerald-500",
          "shadow-[0_1px_1px_rgba(15,23,42,0.02)]",
        ],
        // Todo: flat border, dimmed
        state === "todo" && [
          "border-slate-200",
          "shadow-[0_1px_1px_rgba(15,23,42,0.02)]",
          "opacity-50",
        ],
      )}
    >
      {/* ── Header ── */}
      <header
        className={cn(
          "flex h-[52px] items-center gap-3 px-5",
          state === "active" && "border-b border-slate-100",
        )}
      >
        {/* Step badge */}
        <span
          className={cn(
            "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
            state === "done"
              ? "bg-emerald-600 text-white"
              : state === "active"
                ? "bg-blue-600 text-white"
                : "bg-slate-200 text-slate-700",
          )}
        >
          {state === "done" ? (
            <Check className="size-[11px]" strokeWidth={3} />
          ) : (
            <span className="text-[11px] font-bold leading-none">{number}</span>
          )}
        </span>

        {/* Title */}
        <h3 className="flex-1 text-[13px] font-semibold tracking-tight text-slate-950">
          {title}
        </h3>

        {/* Inline summary when done */}
        {collapsed && summary ? (
          <p className="max-w-[32rem] truncate text-[12px] text-slate-500">
            {summary}
          </p>
        ) : null}

        {/* Edit button */}
        {collapsed && onEdit ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="h-7 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            Edit
          </Button>
        ) : null}
      </header>

      {/* ── Body — rendered for active and todo; hidden (collapsed) only for done ── */}
      {state !== "done" ? (
        <div className="space-y-4 px-5 py-5">{children}</div>
      ) : null}
    </div>
  );
}

export default SetupStep;
