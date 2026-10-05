/**
 * A segmented control: one choice of a few, always visible. Used for the
 * object type (with counts) and the Published | Latest collected view.
 *
 * A radio group — arrow keys move and choose, Tab enters and leaves it, and the
 * focused segment has a visible ring. Each segment's count is a `CountText`, so
 * its four states stay distinct.
 */

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CountText } from "../shared/components/CountText";
import type { CountValue } from "../shared/components/countValue";

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: CountValue;
  title?: string;
  trailing?: ReactNode;
}

export function Segmented<T extends string>({
  label,
  value,
  segments,
  onChange,
}: {
  /** The group's accessible name: "Object type". */
  label: string;
  /** The chosen segment, or undefined when the page is on something that is not one of them. */
  value: T | undefined;
  segments: Segment<T>[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // The group is one Tab stop: the chosen segment, or the first when none is.
  const stop = Math.max(0, segments.findIndex((s) => s.value === value));
  const move = (index: number) => {
    const n = segments.length;
    const next = (index + n) % n;
    refs.current[next]?.focus();
    onChange(segments[next].value);
  };
  const onKey = (e: KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(segments.length - 1);
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.5">
      {segments.map((s, i) => {
        const on = s.value === value;
        return (
          <button
            key={s.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === stop ? 0 : -1}
            title={s.title}
            onClick={() => onChange(s.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--color-primary)",
              on
                ? "bg-(--color-surface-raised) text-(--color-text) shadow-sm"
                : "text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {s.label}
            {s.count ? <CountText count={s.count} className="text-xs text-(--color-text-muted)" /> : null}
            {s.trailing}
          </button>
        );
      })}
    </div>
  );
}
