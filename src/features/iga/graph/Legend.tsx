/**
 * Always visible (SPEC-iga-phase2-graph.md §2.14.11 *Controls* — Legend):
 * node kinds, the four edge labels, dashed = stale, the cycle marker, the
 * out-of-scope marker, the truncation chip.
 */

import { StatusBadge } from "@/components/console/status";

import { EDGE_LABEL } from "./graphLabels";

const NODE_KINDS: { label: string; swatch: string }[] = [
  { label: "Workload", swatch: "bg-(--color-surface-raised) border-(--color-border-subtle)" },
  { label: "Identity (role, user, group)", swatch: "bg-(--color-surface-raised) border-(--color-border-subtle)" },
  { label: "External principal", swatch: "bg-(--color-surface-subtle) border-dashed border-(--color-border-subtle)" },
  { label: "Statement", swatch: "bg-(--color-surface-raised) border-(--color-border-subtle)" },
  { label: "Resource / selector", swatch: "bg-(--color-surface-raised) border-(--color-border-subtle)" },
];

const EDGE_WORDS = [
  EDGE_LABEL.executes_as,
  EDGE_LABEL.can_assume,
  EDGE_LABEL.grant,
  EDGE_LABEL.target,
  EDGE_LABEL.member_of,
];

export function Legend() {
  return (
    <section
      aria-label="Legend"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-(--color-border-subtle) px-3 py-2 text-[11px] text-(--color-text-muted)"
    >
      {NODE_KINDS.map((k) => (
        <span key={k.label} className="flex items-center gap-1.5">
          <span className={`size-3 rounded border-2 ${k.swatch}`} />
          {k.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="18" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {EDGE_WORDS.join(" · ")}
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
        Stale
      </span>
      <span>cycle = edge closes a loop</span>
      <span>cross-account = edge crosses an account boundary</span>
      <span>dashed border = out of scope / external</span>
      <span className="flex items-center gap-1.5">
        <StatusBadge tone="warning">Truncated</StatusBadge>
        more available — Expand
      </span>
    </section>
  );
}
