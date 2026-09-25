/**
 * The legend (SPEC-iga-phase2-graph.md §2.14.11 *Controls*): a disclosure in
 * the graph toolbar, so it never takes canvas room. What must always be in
 * view — that this is declared access, not evaluated access — is the
 * toolbar's own status line, not hidden in here.
 */

import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { EDGE_LABEL } from "./graphLabels";
import { NODE_ICON } from "./icons";
import type { NodeIcon } from "./nodeView";

const NODE_KINDS: { icon: NodeIcon; label: string }[] = [
  { icon: "workload", label: "Workload" },
  { icon: "role", label: "IAM role" },
  { icon: "user", label: "IAM user" },
  { icon: "group", label: "IAM group" },
  { icon: "external", label: "External principal (dashed)" },
  { icon: "statement", label: "Policy statement" },
  { icon: "resource", label: "Resource named by a statement" },
  { icon: "selector", label: "Selector — a pattern, not a resource" },
  { icon: "more", label: "More loaded relationships, hidden to keep the view readable" },
];

const LINES: { dash?: string; label: string }[] = [
  { label: "Current relationship; the arrow points from holder to target" },
  { dash: "6 4", label: "Stale — not reconfirmed by the latest scan" },
  { dash: "2 4", label: "Ended — no longer present" },
];

const MARKS: [string, string][] = [
  ["×3", "Several independent grants declare the same relationship"],
  ["!", "A condition or other constraint was recorded and not evaluated"],
  ["↻", "Closes a cycle of role assumptions"],
  ["⇄", "Crosses into another account"],
];

export function Legend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Legend and help">
          <CircleHelp className="size-4" /> Legend
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-4 text-xs">
        <section aria-label="Objects" className="space-y-1.5">
          <p className="font-semibold text-(--color-text)">Objects</p>
          {NODE_KINDS.map((k) => {
            const Icon = NODE_ICON[k.icon];
            return (
              <p key={k.label} className="flex items-center gap-2 text-(--color-text-muted)">
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {k.label}
              </p>
            );
          })}
        </section>
        <section aria-label="Relationships" className="space-y-1.5">
          <p className="font-semibold text-(--color-text)">Relationships</p>
          <p className="text-(--color-text-muted)">
            {[EDGE_LABEL.executes_as, EDGE_LABEL.can_assume, EDGE_LABEL.grant, EDGE_LABEL.target, EDGE_LABEL.member_of].join(" · ")}.
            Hover, focus or select a line to see its words.
          </p>
          {LINES.map((l) => (
            <p key={l.label} className="flex items-center gap-2 text-(--color-text-muted)">
              <svg width="22" height="8" aria-hidden="true" className="shrink-0">
                <line x1="0" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray={l.dash} />
              </svg>
              {l.label}
            </p>
          ))}
          {MARKS.map(([mark, text]) => (
            <p key={mark} className="flex items-center gap-2 text-(--color-text-muted)">
              <span className="w-[22px] shrink-0 text-center font-semibold">{mark}</span>
              {text}
            </p>
          ))}
        </section>
        <p className="border-t border-(--color-border-subtle) pt-3 text-(--color-text-muted)">
          Everything here is declared by policy and configuration. Whether a request would succeed has not been
          evaluated: conditions, boundaries, Deny statements and resource policies are recorded, not applied.
        </p>
      </PopoverContent>
    </Popover>
  );
}
