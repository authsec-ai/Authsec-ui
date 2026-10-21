/**
 * Building blocks for the one-page setup forms (Add MCP, Register agent,
 * New identity provider): numbered section cards, the explainer side panel,
 * a segmented control, a dark code block and live check rows.
 *
 * Token colours only. Nothing renders below 12.5px.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Check, Circle, Copy, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Main column plus the explainer panel; the panel stacks below on small screens. */
export function SetupLayout({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className="min-w-0 xl:sticky xl:top-4">{side}</aside>
    </div>
  );
}

/** Two section cards side by side on wide screens. */
export function SectionRow({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>;
}

export function SectionCard({
  n,
  title,
  aside,
  children,
  disabled = false,
}: {
  n: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  /** Dims the card (e.g. before the step it depends on is done). */
  disabled?: boolean;
}) {
  const id = `setup-sec-${n}`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) p-5",
        disabled && "opacity-70",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--color-primary) text-[length:13px] font-semibold text-white"
        >
          {n}
        </span>
        <h2 id={id} className="sec-title">
          {title}
        </h2>
        {aside ? (
          <div className="ml-auto text-[length:13px] text-(--color-text-muted)">{aside}</div>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SidePanel({
  title,
  items,
  children,
}: {
  title: string;
  items: { term: string; body: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) p-5">
      <h2 className="text-[length:var(--font-size-md)] font-semibold text-(--color-text)">{title}</h2>
      <dl className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.term}>
            <dt className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">{item.term}</dt>
            <dd className="mt-0.5 text-[length:var(--font-size-sm)] leading-relaxed text-(--color-text-muted)">
              {item.body}
            </dd>
          </div>
        ))}
      </dl>
      {children ? <div className="mt-4 space-y-2 border-t border-(--color-border-subtle) pt-4">{children}</div> : null}
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  id,
  required = false,
  children,
}: {
  htmlFor?: string;
  id?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      id={id}
      className="block text-[length:13px] font-medium text-(--color-text)"
    >
      {children}
      {required ? (
        <span className="text-(--color-danger)" aria-hidden>
          {" "}
          *
        </span>
      ) : null}
    </label>
  );
}

export function FieldHelp({ id, error, children }: { id?: string; error?: boolean; children: ReactNode }) {
  return (
    <p
      id={id}
      role={error ? "alert" : undefined}
      className={cn(
        "text-[length:13px] leading-relaxed",
        error ? "text-(--color-danger-text)" : "text-(--color-text-muted)",
      )}
    >
      {children}
    </p>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className="inline-flex flex-wrap rounded-lg border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.title}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[length:var(--font-size-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-(--color-surface-raised) font-semibold text-(--color-text) shadow-(--shadow-pill)"
                : "text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dark (inverse) code block. `display` lets a secret be masked on screen. */
export function DarkCode({ code, display, label }: { code: string; display?: string; label?: string }) {
  return (
    <pre
      aria-label={label}
      className="max-h-96 overflow-auto whitespace-pre rounded-lg bg-(--color-surface-inverse) px-4 py-3.5 font-mono text-[length:13px] leading-relaxed text-(--color-surface-base)"
    >
      {display ?? code}
    </pre>
  );
}

export function CopyCodeButton({ code, what = "Code", label = "Copy code" }: { code: string; what?: string; label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copyToClipboard(code, what)}>
      <Copy className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}

/** Read-only value with a Copy link (Redirect URI, ACS URL…). */
export function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-28 shrink-0 text-[length:13px] text-(--color-text-muted)">{label}</span>
      <code className="min-w-0 break-all rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-2.5 py-1 font-mono text-[length:13px] text-(--color-text)">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copyToClipboard(value, label)}
        className="text-[length:13px] font-medium text-(--color-primary-text) underline underline-offset-2 hover:decoration-2"
      >
        Copy<span className="sr-only"> {label}</span>
      </button>
    </div>
  );
}

export type CheckState = "done" | "running" | "pending" | "failed" | "action";

/** One live check: icon, title, detail, optional action. */
export function CheckRow({
  state,
  title,
  detail,
  action,
}: {
  state: CheckState;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span aria-hidden className="mt-0.5 shrink-0">
        {state === "done" ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-success) text-white">
            <Check className="size-3.5" />
          </span>
        ) : state === "failed" ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-danger) text-white">
            <X className="size-3.5" />
          </span>
        ) : state === "action" ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-warning-soft) text-(--color-warning-text)">
            <AlertTriangle className="size-3.5" />
          </span>
        ) : state === "running" ? (
          <Loader2 className="size-6 animate-spin text-(--color-primary)" />
        ) : (
          <Circle className="size-6 text-(--color-border-strong)" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">
          {title}
          <span className="sr-only">
            {state === "done"
              ? " (passed)"
              : state === "failed"
                ? " (failed)"
                : state === "action"
                  ? " (needs you)"
                  : state === "running"
                    ? " (in progress)"
                    : " (not yet)"}
          </span>
        </p>
        {detail ? (
          <p className="mt-0.5 break-words text-[length:13px] leading-relaxed text-(--color-text-muted)">{detail}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

export function CheckList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-(--color-border-subtle)">{children}</ul>;
}

/** Placeholder text inside a card whose content depends on an earlier step. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-(--color-border-subtle) px-4 py-3 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
      {children}
    </p>
  );
}
