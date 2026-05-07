/**
 * `ConfigRuntimeToggle` — Configuration view ↔ Runtime view pill.
 *
 * Phase 3 ships only the UI. Runtime view content (effective access by
 * role) requires a backend endpoint that isn't live yet, so we display
 * a tooltip on the Runtime button explaining it.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ConfigRuntimeMode = "configuration" | "runtime";

export interface ConfigRuntimeToggleProps {
  mode?: ConfigRuntimeMode;
  onChange?: (mode: ConfigRuntimeMode) => void;
  className?: string;
  /** When true, disable the Runtime tab and explain why. */
  runtimeDisabledReason?: string;
}

export function ConfigRuntimeToggle({
  mode: controlledMode,
  onChange,
  className,
  runtimeDisabledReason = "Requires backend runtime-summary endpoint.",
}: ConfigRuntimeToggleProps) {
  const [internalMode, setInternalMode] = useState<ConfigRuntimeMode>("configuration");
  const mode = controlledMode ?? internalMode;
  const setMode = (next: ConfigRuntimeMode) => {
    if (next === "runtime" && runtimeDisabledReason) return;
    onChange?.(next);
    if (controlledMode === undefined) setInternalMode(next);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted p-0.5 text-xs",
        className,
      )}
      role="tablist"
      aria-label="View mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "configuration"}
        onClick={() => setMode("configuration")}
        className={cn(
          "rounded-full px-3 py-1 font-semibold transition-colors",
          mode === "configuration"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Configuration
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "runtime"}
        onClick={() => setMode("runtime")}
        title={runtimeDisabledReason || undefined}
        disabled={Boolean(runtimeDisabledReason)}
        className={cn(
          "rounded-full px-3 py-1 font-semibold transition-colors",
          mode === "runtime"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          runtimeDisabledReason && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
        )}
      >
        Runtime
      </button>
    </div>
  );
}
