/**
 * The identity-graph pages' reading surfaces, one type scale throughout:
 *
 * - a section title is 13 px semibold in sentence case, never shouting caps;
 * - a label is 12 px muted and sits BESIDE its value, so a fact is one line;
 * - a value is 13 px; an identifier is 12 px mono;
 * - a panel is one bordered object with its title, count and actions in its
 *   own header — the page is a set of these, not one long card.
 */

import type { ReactNode } from "react";
import { Copy } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { cn } from "@/lib/utils";

export function Panel({
  title,
  count,
  actions,
  description,
  flush = false,
  className,
  children,
}: {
  title: ReactNode;
  /** "1 of 1", "3 policies": muted, beside the title. */
  count?: ReactNode;
  /** Links or buttons at the right of the header. */
  actions?: ReactNode;
  /** One muted line under the title, when the section needs its meaning said once. */
  description?: ReactNode;
  /** The body is a list of rows that bring their own padding. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)", className)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--color-border-subtle) px-4 py-2.5">
        <h3 className="text-[13px] font-semibold leading-5 text-(--color-text)">{title}</h3>
        {count != null ? <span className="text-xs tabular-nums text-(--color-text-muted)">{count}</span> : null}
        {actions ? <div className="ml-auto flex items-center gap-3 text-xs">{actions}</div> : null}
        {description ? <p className="basis-full text-xs leading-relaxed text-(--color-text-muted)">{description}</p> : null}
      </header>
      <div className={flush ? undefined : "px-4 py-3"}>{children}</div>
    </section>
  );
}

/** Label beside value, aligned in one column of labels. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2.5", className)}>{children}</dl>;
}

export function Fact({ label, children, mono = false }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-xs text-(--color-text-muted)">{label}</dt>
      <dd className={cn("min-w-0 break-words text-[13px] leading-5 text-(--color-text)", mono && "break-all font-mono text-xs")}>{children}</dd>
    </>
  );
}

/** Secondary words under a name or a fact: 12 px muted. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-(--color-text-muted)", className)}>{children}</p>;
}

/**
 * One claim in a list: what it is on the left (an optional kind above the
 * name), its basis, lifecycle and evidence on the right, any explanation
 * underneath at full width.
 */
export function ClaimRow({ eyebrow, title, facts, children }: { eyebrow?: ReactNode; title: ReactNode; facts: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-0.5 text-xs text-(--color-text-muted)">{eyebrow}</p> : null}
          {title}
        </div>
        {facts}
      </div>
      {children}
    </div>
  );
}

/** An identifier to read and copy: mono, wrapping, with a quiet copy button. */
export function CopyValue({ value, what = "Value" }: { value: string; what?: string }) {
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 break-all font-mono text-xs leading-5">{value}</span>
      <button
        type="button"
        aria-label={`Copy the ${what.toLowerCase()}`}
        title="Copy"
        onClick={() => void copyToClipboard(value, what)}
        className="grid size-5 shrink-0 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}
