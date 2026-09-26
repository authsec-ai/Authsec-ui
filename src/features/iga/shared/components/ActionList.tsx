/**
 * A statement's actions, readable at any length. A few are shown as they
 * are; a long list (an AWS managed policy lists eighty) is summarised by
 * service — "ec2 · 34", "elasticloadbalancing · 41" — and opens to every
 * action, grouped under its service. Nothing is dropped: the summary is a
 * count of what the list holds, and every action is one click away.
 */

import { useState } from "react";

import { cn } from "@/lib/utils";

const INLINE_MAX = 8;

const chip = "rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-xs leading-5 text-(--color-text)";

export function ActionList({ actions, className }: { actions: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  if (actions.length <= INLINE_MAX) {
    return (
      <span className={cn("flex flex-wrap gap-1", className)}>
        {actions.map((a) => (
          <code key={a} className={cn(chip, "break-all")}>
            {a}
          </code>
        ))}
      </span>
    );
  }

  const byService = new Map<string, string[]>();
  for (const a of actions) {
    const i = a.indexOf(":");
    const service = i > 0 ? a.slice(0, i) : "other";
    byService.set(service, [...(byService.get(service) ?? []), i > 0 ? a.slice(i + 1) : a]);
  }
  const services = [...byService.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {services.map(([service, list]) => (
          <span key={service} className={chip}>
            {service}
            <span className="ml-1 text-(--color-text-muted)">· {list.length}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-1 text-xs font-medium text-(--color-primary-text) hover:underline"
        >
          {open ? "Hide actions" : `Show all ${actions.length} actions`}
        </button>
      </div>
      {open ? (
        <dl className="space-y-2 rounded-md border border-(--color-border-subtle) p-3">
          {services.map(([service, list]) => (
            <div key={service} className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-3">
              <dt className="font-mono text-xs font-medium text-(--color-text)">
                {service} <span className="font-sans font-normal text-(--color-text-muted)">{list.length}</span>
              </dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-(--color-text-muted)">
                {[...list].sort().map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
