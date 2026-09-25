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

const CATEGORIES: { icon: NodeIcon; label: string; chip: string }[] = [
  { icon: "workload", label: "Workload or agent", chip: "bg-(--color-object-workload-soft) text-(--color-object-workload-text)" },
  { icon: "role", label: "Identity — Role, User or Group", chip: "bg-(--color-object-identity-soft) text-(--color-object-identity-text)" },
  { icon: "resource", label: "Resource — an exact reference or a selector (pattern)", chip: "bg-(--color-object-resource-soft) text-(--color-object-resource-text)" },
  { icon: "statement", label: "Policy statement (Detailed view)", chip: "bg-(--color-object-statement-soft) text-(--color-object-statement-text)" },
  { icon: "external", label: "External or unresolved — dashed outline", chip: "bg-(--color-object-external-soft) text-(--color-object-external-text)" },
  { icon: "more", label: "Folded: more loaded relationships, select to review", chip: "bg-(--color-surface-subtle) text-(--color-text-muted)" },
];

const LINES: { dash?: string; label: string }[] = [
  { label: "Current; the arrow points from holder to target" },
  { dash: "6 4", label: "Stale — not reconfirmed by the latest scan" },
  { dash: "2 4", label: "Ended — no longer present" },
  { dash: "10 3 2 3", label: "Deny statement (recorded, not evaluated)" },
];

const MARKS: [string, string][] = [
  ["×3", "Several independent grants behind one line"],
  ["!", "A condition or other constraint was recorded and not evaluated"],
  ["↻", "Closes a cycle of role assumptions"],
  ["⇄", "Crosses into another account"],
];

export function Legend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Legend and help" title="Legend and help">
          <CircleHelp className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-4 text-xs">
        <section aria-label="Objects" className="space-y-1.5">
          <p className="font-semibold text-(--color-text)">Objects — colour says what kind, never whether it is safe</p>
          {CATEGORIES.map((k) => {
            const Icon = NODE_ICON[k.icon];
            return (
              <p key={k.label} className="flex items-center gap-2 text-(--color-text-muted)">
                <span className={`grid size-5 shrink-0 place-items-center rounded ${k.chip}`}>
                  <Icon aria-hidden="true" className="size-3" />
                </span>
                {k.label}
              </p>
            );
          })}
        </section>
        <section aria-label="Relationships" className="space-y-1.5">
          <p className="font-semibold text-(--color-text)">Relationships</p>
          <p className="text-(--color-text-muted)">
            <strong className="font-medium">{EDGE_LABEL.executes_as}</strong> — the identity the workload (for ECS, its application) runs as ·{" "}
            <strong className="font-medium">{EDGE_LABEL.task_execution_role}</strong> — the ECS task execution role, for pulling images and writing logs, not for the application ·{" "}
            <strong className="font-medium">{EDGE_LABEL.declares}</strong> — a policy statement lists these actions on this resource or pattern ·{" "}
            <strong className="font-medium">{EDGE_LABEL.can_assume}</strong> · <strong className="font-medium">{EDGE_LABEL.member_of}</strong>. Hover, focus or select a line to see its words.
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
