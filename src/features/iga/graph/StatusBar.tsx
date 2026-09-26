/**
 * The graph's status bar (SPEC-iga-phase2-graph.md §2.14.11 *Controls*): one
 * thin strip under the canvas that is the legend, the count and the zoom at
 * once. It lists only what is drawn — each category with how many cards it
 * has, and a line style or mark only when some line uses it — so nothing in
 * it describes something that is not on screen. Hovering or focusing a
 * category dims every other card. What must always be in view — that this is
 * declared access, not evaluated access — sits at its right.
 */

import { Info, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

import { markedLimitations } from "./graphLabels";
import { NODE_ICON } from "./icons";
import type { NodeCategory, NodeDescription, NodeIcon } from "./nodeView";
import type { VisualEdge, VisualNode } from "./types";

const CATEGORIES: { key: NodeCategory; icon: NodeIcon; label: string; meaning: string; chip: string }[] = [
  { key: "workload", icon: "workload", label: "Workload", meaning: "A workload or agent that runs as an identity", chip: "bg-(--color-object-workload-soft) text-(--color-object-workload-text)" },
  { key: "identity", icon: "role", label: "Identity", meaning: "A role, user or group", chip: "bg-(--color-object-identity-soft) text-(--color-object-identity-text)" },
  { key: "resource", icon: "resource", label: "Resource", meaning: "An exact reference or a selector (pattern) that a statement names", chip: "bg-(--color-object-resource-soft) text-(--color-object-resource-text)" },
  { key: "statement", icon: "statement", label: "Statement", meaning: "One policy statement — Detailed view", chip: "bg-(--color-object-statement-soft) text-(--color-object-statement-text)" },
  { key: "external", icon: "external", label: "External", meaning: "An external or unresolved principal — dashed outline", chip: "bg-(--color-object-external-soft) text-(--color-object-external-text)" },
];

const LINE_STYLES: { key: "stale" | "ended" | "deny"; dash: string; label: string; meaning: string }[] = [
  { key: "stale", dash: "6 4", label: "Stale", meaning: "Not reconfirmed by the latest scan" },
  { key: "ended", dash: "2 4", label: "Ended", meaning: "No longer present" },
  { key: "deny", dash: "10 3 2 3", label: "Deny", meaning: "A Deny statement — recorded, not evaluated against any Allow" },
];

export function StatusBar({
  nodes,
  edges,
  descriptions,
  zoom,
  focusCategory,
  onFocusCategory,
  onZoomIn,
  onZoomOut,
  canvas,
}: {
  nodes: VisualNode[];
  edges: VisualEdge[];
  descriptions: Map<string, NodeDescription>;
  zoom: number | null;
  focusCategory: NodeCategory | null;
  onFocusCategory: (c: NodeCategory | null) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** false in Paths: no cards to dim, no zoom. */
  canvas: boolean;
}) {
  const counts = new Map<NodeCategory, number>();
  let folded = 0;
  for (const n of nodes) {
    if (n.overflow) {
      folded += 1;
      continue;
    }
    const c = descriptions.get(n.id)?.category;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const styles = LINE_STYLES.filter((s) =>
    edges.some((e) => (s.key === "deny" ? e.summary?.effect === "deny" : e.state === s.key)),
  );
  const marks: [string, string][] = [];
  if (edges.some((e) => markedLimitations(e).length)) marks.push(["!", "A condition or other constraint was recorded, not evaluated"]);
  if (edges.some((e) => e.crossesAccount)) marks.push(["⇄", "Crosses into another account"]);
  if (edges.some((e) => e.closesCycle)) marks.push(["↻", "Closes a cycle of role assumptions"]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-(--color-border-subtle) px-3 py-1.5 text-[11px] text-(--color-text-muted)">
      <ul className="flex flex-wrap items-center gap-1" aria-label="Drawn objects" onMouseLeave={() => onFocusCategory(null)}>
        {CATEGORIES.filter((c) => counts.has(c.key)).map((c) => {
          const Icon = NODE_ICON[c.icon];
          const active = focusCategory === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                disabled={!canvas}
                title={c.meaning}
                aria-pressed={active}
                onMouseEnter={() => canvas && onFocusCategory(c.key)}
                onFocus={() => canvas && onFocusCategory(c.key)}
                onBlur={() => onFocusCategory(null)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
                  active ? "bg-(--color-surface-subtle) text-(--color-text)" : "hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                )}
              >
                <span className={cn("grid size-4 place-items-center rounded-sm", c.chip)}>
                  <Icon aria-hidden="true" className="size-2.5" />
                </span>
                {c.label}
                <span className="tabular-nums text-(--color-text-subtle)">{counts.get(c.key)}</span>
              </button>
            </li>
          );
        })}
        {folded ? (
          <li className="inline-flex items-center gap-1.5 px-1.5 py-0.5" title="Folded branches: more loaded relationships. Select one to review them.">
            <span className="grid size-4 place-items-center rounded-sm border border-dashed border-(--color-border-strong) text-[9px] leading-none">···</span>
            Folded
            <span className="tabular-nums text-(--color-text-subtle)">{folded}</span>
          </li>
        ) : null}
      </ul>

      {styles.length || marks.length ? (
        <ul className="flex flex-wrap items-center gap-3" aria-label="Line styles in view">
          {styles.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5" title={s.meaning}>
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray={s.dash} />
              </svg>
              {s.label}
            </li>
          ))}
          {marks.map(([mark, text]) => (
            <li key={mark} className="inline-flex items-center gap-1" title={text}>
              <span className="font-semibold text-(--color-text)">{mark}</span>
              <span className="sr-only">{text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1"
          title="Everything here is declared by policy and configuration. Whether a request would succeed has not been evaluated: conditions, boundaries, Deny statements and resource policies are recorded, not applied."
        >
          <Info aria-hidden="true" className="size-3" />
          Declared access · not evaluated
        </span>
        {canvas ? (
          <span className="inline-flex items-center rounded border border-(--color-border-subtle)" role="group" aria-label="Zoom">
            <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out" className="grid size-6 place-items-center hover:bg-(--color-surface-subtle) hover:text-(--color-text)">
              <Minus className="size-3" />
            </button>
            <span className="w-10 text-center tabular-nums" aria-live="polite">
              {zoom != null ? `${Math.round(zoom * 100)}%` : "—"}
            </span>
            <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in" className="grid size-6 place-items-center hover:bg-(--color-surface-subtle) hover:text-(--color-text)">
              <Plus className="size-3" />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
