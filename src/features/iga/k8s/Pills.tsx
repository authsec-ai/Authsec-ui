/** The small marks a Kubernetes rule carries on the Overview and the Access tab. */

import { AlertTriangle, Asterisk, Eye, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import { scopeBadge, type RuleFlags, type Scope } from "./rules";

const PILL = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4";

/** `cluster-wide` or `namespace prod`: the binding decides where a rule applies, so this is said beside the binding. */
export function ScopeBadge({ scope }: { scope: Scope | null }) {
  if (!scope) return <span className={cn(PILL, "bg-(--color-surface-subtle) text-(--color-text-muted)")}>scope not stated</span>;
  return (
    <span
      className={cn(PILL, scope.kind === "cluster" ? "bg-(--color-warning-soft) text-(--color-warning-text)" : "bg-(--color-info-soft) text-(--color-info-text)")}
      title={scope.kind === "cluster" ? "Bound by a ClusterRoleBinding: applies in every namespace and to cluster-scoped objects" : "Bound by a RoleBinding: applies in this namespace only"}
    >
      {scopeBadge(scope)}
    </span>
  );
}

/** Wildcard, Named instances only, Privilege escalation — and Unconfirmed when the sweep could not reconfirm it. */
export function RulePills({ flags, stale = false }: { flags: RuleFlags; stale?: boolean }) {
  return (
    <>
      {flags.wildcard ? (
        <span className={cn(PILL, "bg-(--color-danger-soft) text-(--color-danger-text)")} title="A verb, a resource or an API group is *">
          <Asterisk className="size-3" aria-hidden="true" />
          Wildcard
        </span>
      ) : null}
      {flags.escalation ? (
        <span className={cn(PILL, "bg-(--color-warning-soft) text-(--color-warning-text)")} title={`Privilege escalation: ${flags.escalation}`}>
          <ShieldAlert className="size-3" aria-hidden="true" />
          Privilege escalation
        </span>
      ) : null}
      {flags.named ? (
        <span
          className={cn(PILL, "bg-(--color-surface-subtle) text-(--color-text-muted)")}
          title="Applies to the named objects only. resourceNames do not constrain list, watch or create."
        >
          <Eye className="size-3" aria-hidden="true" />
          Named instances only
        </span>
      ) : null}
      {stale ? (
        <span className={cn(PILL, "bg-(--color-warning-soft) text-(--color-warning-text)")} title="The latest sweep could not reconfirm it. It is still believed, not gone.">
          <AlertTriangle className="size-3" aria-hidden="true" />
          Unconfirmed, still believed
        </span>
      ) : null}
    </>
  );
}
