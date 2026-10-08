/**
 * The selection card (SPEC-iga-phase2-graph.md §2.14.11 *Selection*): what a
 * selected card or line IS, in one plain sentence, a few facts, the one
 * uncertainty that matters, and the next step — View evidence, Open
 * details. Readable without scrolling on a normal desktop.
 *
 * Non-modal and in a stable place (the canvas's top-right corner; the canvas
 * pans so it never covers what is selected). The deeper evidence panel
 * replaces it — one layer at a time, never a drawer on a drawer. Escape
 * closes it and returns focus to the card or line it came from.
 *
 * Order (SPEC-console-revamp.md *Graph inspector*): what was selected, what
 * the relationship means (EDGE_MEANING), why AuthSec shows it (basis,
 * confirmation), ONE qualification, then the way to the evidence, where the
 * source API and the full records are. The ARN, the relationship sentence and
 * the declared-access line each appear once: a name already in the title is
 * not repeated as a fact, and the declared-access line belongs to the
 * evidence layer and the status bar.
 *
 * Every sentence is built from the loaded graph and says only what the
 * data says: a declared relationship is never "can access", an exact
 * reference is not proof a resource exists, a selector is not a list.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { objectPath, refType, type Basis, type GraphFrontier, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { accountWithId, limitationText } from "../shared/labels";
import { bindingKindWord, groupWords, parseAnchor, roleKindWord, ruleFlags, scopeBadge, scopeOfBinding, workloadKindWord } from "../k8s/rules";
import { CategoryChip } from "../shared/components/CategoryChip";
import { Timestamp } from "../shared/components/Timestamp";
import { WrapId } from "../shared/components/WrapId";
import { edgeMeaning, edgeVerb, frontierLabel, independentCount, isK8sEdge, markedLimitations } from "./graphLabels";
import { describeNode, type NodeCategory } from "./nodeView";
import { frontierKey, type FrontierControl, type VisualEdge, type VisualNode } from "./types";

export type SelectionSubject = { kind: "node"; visual: VisualNode } | { kind: "edge"; edge: VisualEdge };

export interface SelectionActions {
  onClose: () => void;
  onEvidence: (claims: GraphRef[]) => void;
  onOpenObject: (ref: GraphRef) => void;
  onFocusHere: (ref: GraphRef) => void;
  onSelectNode: (id: string) => void;
  onShowBranch: (overflowId: string, select?: string) => void;
  onShowWorkloads: (refs: GraphRef[]) => void;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
}

/** Why a relationship is shown, in a clause: where its claim came from (§2.14.9). */
const BASIS_SHORT: Record<Basis, string> = {
  declared: "Declared in configuration; not observed in use",
  observed: "Observed in activity AWS reported",
  derived: "Derived from other collected claims",
  asserted: "Recorded by a person in AuthSec",
};

/** Why a Kubernetes relationship is shown: the sweep's own basis, never an AWS one. */
const K8S_BASIS_SHORT: Partial<Record<Basis, string>> = {
  declared: "Declared in the cluster's RBAC or the workload's spec; not seen in use",
  observed: "Observed: the sweep saw the Pod run as this ServiceAccount",
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 text-[13px]">
      <dt className="w-24 shrink-0 text-(--color-text-muted)">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-(--color-text)">{children}</dd>
    </div>
  );
}

/** How a card relates to the rest of what is drawn, from the loaded edges. */
function relatives(v: VisualNode, edges: VisualEdge[], nodes: Map<GraphRef, GraphNode>) {
  const ref = v.members[0].ref;
  const out = (kind: VisualEdge["kind"]) => edges.filter((e) => e.kind === kind && e.members.some((m) => m.from === ref));
  const inn = (kind: VisualEdge["kind"]) => edges.filter((e) => e.kind === kind && e.members.some((m) => m.to === ref));
  const name = (r: GraphRef) => nodes.get(r)?.label ?? "an object not loaded";
  return { out, inn, name };
}

/**
 * A Kubernetes card, in the sentence the inspector reads: for a rule, "Rule in
 * ClusterRole X, bound to this ServiceAccount by RoleBinding Y in namespace Z".
 * What was not evaluated is the status bar's and the page's to say once.
 */
function k8sNodeSummary(v: VisualNode, d: ReturnType<typeof describeNode>, edges: VisualEdge[], nodes: Map<GraphRef, GraphNode>) {
  const first = v.members[0];
  const ref = first.ref;
  const facts: [string, ReactNode][] = [];
  let sentence: string;
  const where = (n: GraphNode) => (n.sub_scope ? ` in namespace ${n.sub_scope}` : "");

  if (first.kind === "workload") {
    const runs = edges.find((e) => e.kind === "executes_as" && e.members.some((m) => m.from === ref))?.members[0];
    const sa = runs ? nodes.get(runs.to) : undefined;
    const saName = sa ? parseAnchor(sa.label)?.name ?? sa.label : null;
    const kind = workloadKindWord(first.runtime_kind) ?? "workload";
    sentence = `A Kubernetes ${kind}${where(first)}${first.scope ? `, cluster ${first.scope.label}` : ""}. ${
      saName && runs ? `It ${runs.basis === "observed" ? "runs as" : "is configured to run as"} ServiceAccount ${saName}.` : "The ServiceAccount it runs as is not loaded."
    }`;
  } else if (first.kind === "statement") {
    const n = v.members.length;
    const roleKind = roleKindWord(v.k8s?.roleKind);
    const role = `${roleKind ?? "a role"}${v.k8s?.role ? ` ${v.k8s.role}` : ""}`;
    const holderRef = edges.find((e) => e.kind === "grant" && e.members.some((m) => m.to === ref))?.members[0].from;
    const holder = holderRef ? nodes.get(holderRef) : undefined;
    const noun = holder?.kind === "k8s_group" ? "this group" : holder?.kind === "k8s_user" ? "this user" : "this ServiceAccount";
    const bound = (v.k8s?.bindings ?? []).map((b) => {
      const scope = scopeOfBinding(b);
      return `${bindingKindWord(b.kind)} ${b.name || "(unnamed)"} ${scope?.kind === "namespace" ? `in namespace ${scope.namespace}` : "(cluster-wide)"}`;
    });
    sentence = `${n === 1 ? "Rule" : `${n} rules`} in ${role}${bound.length ? `, bound to ${noun} by ${bound.join(" and ")}` : ". The binding that applies it is not loaded"}.`;
    if (n === 1) {
      const rule = first.k8s_rule;
      if (rule) {
        facts.push(["Verbs", rule.verbs.join(", ") || "none"]);
        facts.push(["On", [...rule.resources, ...rule.non_resource_urls].join(", ") || "none stated"]);
        facts.push(["API group", groupWords(rule.api_groups)]);
        const f = ruleFlags(rule);
        const notes = [
          f.wildcard ? "Wildcard" : null,
          f.escalation ? `Privilege escalation: ${f.escalation}` : null,
          f.named ? `Named instances only (${rule.resource_names.join(", ")}); names do not constrain list, watch or create` : null,
        ].filter(Boolean);
        if (notes.length) facts.push(["Note", notes.join(" · ")]);
      }
    }
  } else {
    const kind = first.kind === "k8s_service_account" ? "ServiceAccount" : first.kind === "k8s_group" ? "group" : "user";
    sentence =
      first.kind === "k8s_service_account"
        ? `A Kubernetes ServiceAccount${where(first)}${first.scope ? `, cluster ${first.scope.label}` : ""}. Rules reach it through RoleBindings and ClusterRoleBindings.`
        : `A Kubernetes ${kind} that a binding names${first.scope ? ` in cluster ${first.scope.label}` : ""}. The cluster holds no object for it; it is known only from the binding.`;
    const direct = first.used_by_count;
    if (direct) facts.push(["Used by", direct.value == null ? "Not known" : `${direct.exact ? "" : "at least "}${direct.value} workload${direct.value === 1 ? "" : "s"} directly`]);
  }
  return { d, sentence, facts, why: { basis: null as Basis | null, at: first.last_confirmed_at } };
}

function nodeSummary(v: VisualNode, edges: VisualEdge[], nodes: Map<GraphRef, GraphNode>, rootAccountId: string | null) {
  const first = v.members[0];
  const d = describeNode(v, rootAccountId);
  // A reference already in the title is not stated again as a fact.
  const refFact = (label: string): [string, ReactNode][] =>
    first.text && first.text !== d.title ? [[label, <WrapId className="font-mono text-xs">{first.text}</WrapId>]] : [];
  const { out, inn, name } = relatives(v, edges, nodes);
  const facts: [string, ReactNode][] = [];
  let sentence: string;

  if (v.overflow) {
    const n = v.overflow.hidden.reduce((c, h) => c + h.members.length, 0);
    sentence = v.overflow.infrastructure
      ? `What the ECS task execution role declares — ${n} loaded, folded as supporting infrastructure. The application does not run as this role.`
      : `${n} loaded relationships are folded to keep the view readable. Nothing is missing: each is listed below and in Paths.`;
    if (v.overflow.moreNotLoaded) facts.push(["Also", "More of these exist that are not loaded yet."]);
    return { d, sentence, facts, why: null };
  }
  if (first.kind === "workload" && v.members.length > 1) {
    sentence = `${v.members.length} workloads are configured to run as the same identity. They share one card; each keeps its own evidence.`;
    return { d, sentence, facts, why: null };
  }

  if (first.provider === "k8s") return k8sNodeSummary(v, d, edges, nodes);

  switch (first.kind) {
    case "workload": {
      const runs = out("executes_as")[0]?.members[0];
      const infra = out("task_execution_role")[0]?.members[0];
      sentence = runs
        ? `${d.type.replace("Workload · ", "")} configured to run as ${name(runs.to)}${first.runtime_kind === "ecs_task_definition" ? " (its task role — what the application runs as)" : ""}.`
        : "No identity it runs as is loaded.";
      if (infra) facts.push(["ECS agent uses", `${name(infra.to)} — to pull images and write logs, not for the application`]);
      facts.push(["Account", accountWithId(first.account) ?? "Not known"]);
      break;
    }
    case "iam_role":
    case "iam_user":
    case "iam_group": {
      const infraFor = inn("task_execution_role").length;
      const runs = inn("executes_as").length;
      sentence = infraFor && !runs
        ? `A role the ECS agent uses to start ${infraFor === 1 ? "a task" : `${infraFor} tasks`}. Its permissions support the infrastructure, not the application.`
        : `An IAM ${first.kind === "iam_role" ? "role" : first.kind === "iam_user" ? "user" : "group"}${first.account ? ` in ${first.account.label && first.account.label !== first.account.id ? first.account.label : first.account.id}` : ""}.`;
      const direct = first.used_by_count;
      if (direct && first.kind !== "iam_group")
        facts.push([
          "Used by",
          direct.value == null ? "Not known" : `${direct.exact ? "" : "at least "}${direct.value} workload${direct.value === 1 ? "" : "s"} directly`,
        ]);
      const trusts = inn("can_assume").length;
      if (trusts) facts.push(["May be assumed by", `${trusts} loaded principal${trusts === 1 ? "" : "s"}`]);
      break;
    }
    case "statement":
      sentence = `A${first.effect === "deny" ? " Deny" : "n Allow"} statement in ${first.policy ?? "a policy"} listing ${first.label || "no actions"}.`;
      if (first.sid) facts.push(["Sid", first.sid]);
      break;
    case "exact":
      sentence = "An exact reference named by a policy statement. That this resource exists has not been confirmed.";
      facts.push(...refFact("Reference"));
      break;
    case "selector":
      sentence = "A pattern that policy statements name. It is not a list of resources — what it matches was not enumerated.";
      facts.push(...refFact("Pattern"));
      break;
    case "external":
      sentence = "A resource outside the connected accounts, or one that could not be resolved. Nothing about it was read.";
      break;
    default:
      sentence = first.account
        ? `A principal in ${first.account.connected ? "another" : "a not-connected"} account, named by a trust policy.`
        : "A principal outside AWS accounts, named by a trust policy.";
      if (first.resolution) facts.push(["Resolution", first.resolution.state.replace(/_/g, " ")]);
  }
  return { d, sentence, facts: facts.slice(0, 3), why: { basis: null as Basis | null, at: first.last_confirmed_at } };
}

/** A Kubernetes line: a workload running as a ServiceAccount, or the binding that applies a role's rules to it. */
function k8sEdgeSummary(e: VisualEdge, nodes: Map<GraphRef, GraphNode>) {
  const m = e.members[0];
  const nameOf = (r: GraphRef) => {
    const n = nodes.get(r);
    return n ? (n.kind === "k8s_service_account" ? parseAnchor(n.label)?.name ?? n.label : n.label) : "an object not loaded";
  };
  const facts: [string, ReactNode][] = [];
  let title = `${nameOf(m.from)} → ${nameOf(m.to)}`;
  if (e.kind === "grant") {
    const rules = new Set(e.members.map((x) => x.to));
    const to = nodes.get(m.to);
    title = `${nameOf(m.from)} → ${roleKindWord(m.policy_kind) ?? "Role"} ${to?.policy ?? ""}`.trim();
    const bindings = e.members.flatMap((x) => (x.assignment ? [x.assignment] : []));
    const distinct = [...new Map(bindings.map((b) => [b.ref, b])).values()];
    for (const b of distinct.slice(0, 2)) {
      const scope = scopeOfBinding(b);
      facts.push([bindingKindWord(b.kind), `${b.name || "(unnamed)"}${scope ? ` · ${scopeBadge(scope)}` : ""}`]);
    }
    facts.push(["Rules", `${rules.size} in this role reach it through ${distinct.length === 1 ? "this binding" : `${distinct.length} bindings`}`]);
  }
  const bases = [...new Set(e.members.map((x) => x.basis))];
  return {
    sentence: edgeMeaning(e),
    facts: facts.slice(0, 3),
    title,
    type: edgeVerb(e),
    why: { basis: bases.length === 1 ? bases[0] : null, at: m.last_confirmed_at },
  };
}

function edgeSummary(e: VisualEdge, nodes: Map<GraphRef, GraphNode>) {
  const m = e.members[0];
  if (isK8sEdge(e)) return k8sEdgeSummary(e, nodes);
  const from = nodes.get(m.from)?.label ?? "Source";
  // A `declares` line's first member is a grant into the statement; the
  // line itself ends at the resource.
  const toRef = (e.kind === "declares" ? e.to : m.to) as GraphRef;
  const to = nodes.get(toRef)?.label ?? "Target";
  const facts: [string, ReactNode][] = [];
  // What the line means is the relationship's definition; the title and the
  // type chip already say which two objects and which verb.
  const sentence = edgeMeaning(e);
  if (e.kind === "declares") {
    const statements = e.summary?.statements ?? [];
    const policies = [...new Set(statements.flatMap((s) => s.members.map((x) => x.policy)).filter(Boolean))];
    const resTo = nodes.get(e.to as GraphRef);
    const count = independentCount(e);
    facts.push(["Statements", `${count} in ${policies.length ? policies.join(", ") : "a policy"}`]);
    // The resource's own text, unless the title already carries it.
    if (resTo?.text && resTo.text !== to)
      facts.push([resTo.kind === "selector" ? "Pattern" : "Resource", <WrapId className="font-mono text-xs">{resTo.text}</WrapId>]);
    if (e.summary?.exclusions.length)
      facts.push(["Except", <WrapId className="font-mono text-xs">{e.summary.exclusions.join(", ")}</WrapId>]);
  } else if (e.kind === "grant" && e.members.length > 1) {
    facts.push(["Grants", `${e.members.length} independent grants`]);
  }
  const bases = [...new Set(e.members.map((x) => x.basis))];
  return {
    sentence,
    facts: facts.slice(0, 3),
    title: `${from} → ${to}`,
    type: edgeVerb(e),
    why: { basis: bases.length === 1 ? bases[0] : null, at: m.last_confirmed_at },
  };
}

function LoadControls({ frontier, a, k8s }: { frontier: GraphFrontier[]; a: SelectionActions; k8s: boolean }) {
  if (!frontier.length) return null;
  return (
    <ul className="space-y-1 border-t border-(--color-border-subtle) pt-2 text-xs">
      {frontier.map((f) => {
        const c = a.stateOf(f);
        return (
          <li key={frontierKey(f)} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-(--color-text-muted)">{frontierLabel(f, k8s)}</span>
            {c.pending === "paused" ? (
              <button type="button" onClick={a.onRefresh} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">Refresh first</button>
            ) : c.pending === "loading" ? (
              <span className="shrink-0 text-(--color-text-muted)">Loading…</span>
            ) : c.expanded ? (
              <span className="flex shrink-0 gap-2">
                {a.canLoadMore(f) ? <button type="button" onClick={() => a.onLoadMore(f)} className="font-medium text-(--color-primary-text) hover:underline">Load more</button> : null}
                <button type="button" onClick={() => a.onCollapse(f)} className="font-medium text-(--color-text-muted) hover:underline">Collapse</button>
              </span>
            ) : (
              <button type="button" onClick={() => a.onExpand(f)} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">
                {c.pending === "failed" ? "Retry" : "Load"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SelectionCard({
  subject,
  edges,
  nodes,
  rootAccountId,
  actions,
  docked,
}: {
  subject: SelectionSubject;
  /** What is drawn, to describe how a card relates to its neighbours. */
  edges: VisualEdge[];
  nodes: Map<GraphRef, GraphNode>;
  rootAccountId: string | null;
  actions: SelectionActions;
  /** Paths: beside the list rather than floating over a canvas. */
  docked?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key = subject.kind === "node" ? `n:${subject.visual.id}` : `e:${subject.edge.id}`;
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  let title: string;
  let type: string;
  let category: NodeCategory | null = null;
  let icon: Parameters<typeof CategoryChip>[0]["icon"] = "statement";
  let sentence: string;
  let facts: [string, ReactNode][];
  let why: { basis: Basis | null; at: string | null } | null = null;
  let claims: GraphRef[] = [];
  let uncertainty: string[] = [];
  let open: GraphRef | null = null;
  let body: ReactNode = null;

  const k8s = subject.kind === "node" ? subject.visual.members[0].provider === "k8s" : isK8sEdge(subject.edge);

  if (subject.kind === "node") {
    const v = subject.visual;
    const s = nodeSummary(v, edges, nodes, rootAccountId);
    title = s.d.title;
    type = s.d.type;
    category = s.d.category;
    icon = s.d.icon;
    sentence = s.sentence;
    facts = s.facts;
    why = s.why;
    // A Kubernetes card's uncertainty is what the sweep could not confirm or read; its scope and
    // wildcard are facts about the grant, said in the sentence and the badges.
    uncertainty = s.d.notes.filter((n) => n.tone === "warning" && (!k8s || ["state", "unresolved", "coverage"].includes(n.key))).map((n) => n.long);
    const first = v.members[0];
    if (!v.overflow && v.members.length === 1) {
      // Kubernetes claims are written from a sweep and have no evidence record: nothing to open.
      claims = k8s ? [] : [first.ref];
      open = objectPath(first.ref) ? first.ref : null;
    }
    if (v.overflow) {
      const o = v.overflow;
      body = (
        <div className="space-y-2">
          <ul className="max-h-40 divide-y divide-(--color-border-subtle) overflow-y-auto rounded-md border border-(--color-border-subtle)">
            {o.hidden.map((h) => {
              const hd = describeNode(h, rootAccountId);
              return (
                <li key={h.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 truncate" title={hd.title}>{hd.title}</span>
                  <button type="button" onClick={() => actions.onShowBranch(v.id, h.id)} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">Show</button>
                </li>
              );
            })}
          </ul>
          <Button size="sm" variant="outline" onClick={() => actions.onShowBranch(v.id)}>Show all on the canvas</Button>
        </div>
      );
    } else if (v.members.length > 1) {
      const workloads = first.kind === "workload";
      body = (
        <div className="space-y-2">
          <ul className="max-h-40 divide-y divide-(--color-border-subtle) overflow-y-auto rounded-md border border-(--color-border-subtle)">
            {v.members.map((m) => (
              <li key={m.ref} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 truncate" title={m.label}>{workloads || k8s ? m.label : [m.policy, m.sid ? `Sid ${m.sid}` : null].filter(Boolean).join(" · ") || "Statement"}</span>
                {k8s && !workloads ? null : (
                  <button type="button" onClick={() => (workloads ? actions.onOpenObject(m.ref) : actions.onEvidence([m.ref]))} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">
                    {workloads ? "Open" : "Evidence"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {workloads ? <Button size="sm" variant="outline" onClick={() => actions.onShowWorkloads(v.members.map((m) => m.ref))}>Draw each workload</Button> : null}
        </div>
      );
    }
    body = (
      <>
        {body}
        <LoadControls frontier={v.frontier} a={actions} k8s={k8s} />
      </>
    );
  } else {
    const e = subject.edge;
    const s = edgeSummary(e, nodes);
    title = s.title;
    type = s.type;
    sentence = s.sentence;
    facts = s.facts;
    why = s.why;
    // A declared relationship's evidence is each statement's claim that it
    // lists the resource (the target claims), one per independent statement.
    claims = k8s ? [] : e.kind === "declares" ? e.members.filter((m) => m.kind === "target").map((m) => m.claim) : e.members.map((m) => m.claim);
    uncertainty = markedLimitations(e).map(limitationText);
    if (e.state === "stale") uncertainty.unshift(k8s ? "Unconfirmed by the latest sweep, and still believed." : "Not reconfirmed by the latest scan.");
    if (k8s && e.state === "ended") uncertainty.unshift("The sweep no longer sees it.");
    if (e.summary?.effect === "deny") uncertainty.unshift("A Deny statement. It was recorded, not evaluated against any Allow.");
  }

  return (
    <section
      aria-labelledby="graph-selection-heading"
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          actions.onClose();
        }
      }}
      className={cn(
        "flex max-h-full flex-col overflow-hidden bg-(--color-surface-raised)",
        docked ? "h-full w-[320px] shrink-0 border-l border-(--color-border-subtle)" : "w-[320px] rounded-lg border border-(--color-border-subtle) shadow-(--shadow-md)",
      )}
    >
      <header className="flex shrink-0 items-start gap-2 px-3.5 pt-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1">
            <CategoryChip category={category} icon={icon}>{type}</CategoryChip>
          </p>
          <h2 ref={headingRef} id="graph-selection-heading" tabIndex={-1} className="break-words text-sm font-semibold leading-snug text-(--color-text) outline-none">
            {title}
          </h2>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0" onClick={actions.onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 pb-3 pt-2">
        <p className="text-[13px] leading-relaxed text-(--color-text)">{sentence}</p>
        {facts.length ? <dl className="space-y-1.5">{facts.map(([l, v]) => <Fact key={l} label={l}>{v}</Fact>)}</dl> : null}
        {why ? (
          <dl className="space-y-1.5 border-t border-(--color-border-subtle) pt-2">
            {why.basis ? <Fact label="Basis">{(k8s ? K8S_BASIS_SHORT[why.basis] : undefined) ?? BASIS_SHORT[why.basis]}</Fact> : null}
            <Fact label="Confirmed"><Timestamp iso={why.at} /></Fact>
          </dl>
        ) : null}
        {uncertainty.length ? (
          <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-xs text-(--color-warning-text)">
            {uncertainty[0]}
            {uncertainty.length > 1 ? ` (+${uncertainty.length - 1} more in evidence)` : ""}
          </p>
        ) : null}
        {body}
        <div className="flex flex-wrap gap-2 pt-1">
          {claims.length ? (
            <Button size="sm" className="text-[length:var(--text-sm)] text-white" onClick={() => actions.onEvidence(claims)}>
              View evidence
            </Button>
          ) : null}
          {open ? (
            <Button size="sm" variant="outline" onClick={() => actions.onOpenObject(open!)}>
              Open details
            </Button>
          ) : null}
          {open && subject.kind === "node" && refType(open) !== "external_principal" && subject.visual.members[0].kind !== "statement" ? (
            <Button size="sm" variant="ghost" onClick={() => actions.onFocusHere(open!)}>
              Graph from here
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
