/**
 * A long identifier (ARN, account id, resource path) shown on one line and
 * shortened in the middle, so both the start (the kind) and the end (the
 * name) stay readable. The full value is on hover; a click copies it, and the
 * control says so. Never wraps a table row onto three lines.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { middleTruncate } from "../ids";

export function TruncatedId({
  value,
  display,
  what = "ID",
  max = 42,
  className,
  mono = true,
}: {
  value: string;
  /** What to show instead of the shortened value (a readable name); the copy is still `value`. */
  display?: string;
  /** For the copy message and the accessible name: "ARN", "Account ID". */
  what?: string;
  max?: number;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shown = display ?? middleTruncate(value, max);
  return (
    <button
      type="button"
      title={`${value}\nClick to copy`}
      aria-label={`${shown}. Copy ${what}`}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value, what, { toastSuccess: false });
        window.clearTimeout(timer.current);
        setCopied(ok);
        if (ok) timer.current = window.setTimeout(() => setCopied(false), 1600);
      }}
      className={cn(
        "group/id inline-flex max-w-full items-center gap-1.5 rounded px-1 -mx-1 text-left text-(--color-text-secondary) transition-colors hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-primary)",
        mono && "font-mono text-xs",
        className,
      )}
    >
      <span className="min-w-0 truncate">{shown}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-(--color-success-text)" aria-hidden="true" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/id:opacity-100 group-focus-visible/id:opacity-100" aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
