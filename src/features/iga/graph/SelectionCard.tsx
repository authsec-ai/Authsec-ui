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
 * Every sentence is built from the loaded graph and says only what the
 * data says: a declared relationship is never "can access", an exact
 * reference is not proof a resource exists, a selector is not a list.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { objectPath, refType, type GraphFrontier, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { accountWithId } from "../shared/labels";
import { Timestamp } from "../shared/components/Timestamp";
import { edgeVerb, frontierLabel, independentCount, markedLimitations } from "./graphLabels";
import { NODE_ICON } from "./icons";
import { describeNode, type NodeCategory } from "./nodeView";
import { limitationText } from "../shared/labels";
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

const CHIP: Record<NodeCategory, string> = {
  workload: "bg-(--color-object-workload-soft) text-(--color-object-workload-text)",
  identity: "bg-(--color-object-identity-soft) text-(--color-object-identity-text)",
  resource: "bg-(--color-object-resource-soft) text-(--color-object-resource-text)",
  statement: "bg-(--color-object-statement-soft) text-(--color-object-statement-text)",
  external: "bg-(--color-object-external-soft) text-(--color-object-external-text)",
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

function nodeSummary(v: VisualNode, edges: VisualEdge[], nodes: Map<GraphRef, GraphNode>, rootAccountId: string | null) {
  const first = v.members[0];
  const d = describeNode(v, rootAccountId);
  const { out, inn, name } = relatives(v, edges, nodes);
  const facts: [string, ReactNode][] = [];
  let sentence: string;

  if (v.overflow) {
    const n = v.overflow.hidden.reduce((c, h) => c + h.members.length, 0);
    sentence = v.overflow.infrastructure
      ? `What the ECS task execution role declares — ${n} loaded, folded as supporting infrastructure. The application does not run as this role.`
      : `${n} loaded relationships are folded to keep the view readable. Nothing is missing: each is listed below and in Paths.`;
    if (v.overflow.moreNotLoaded) facts.push(["Also", "More of these exist that are not loaded yet."]);
    return { d, sentence, facts };
  }
  if (first.kind === "workload" && v.members.length > 1) {
    sentence = `${v.members.length} workloads are configured to run as the same identity. They share one card; each keeps its own evidence.`;
    return { d, sentence, facts };
  }

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
          "Direct bindings",
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
      if (first.text) facts.push(["Reference", <span className="break-all font-mono text-xs">{first.text}</span>]);
      break;
    case "selector":
      sentence = "A pattern that policy statements name. It is not a list of resources — what it matches was not enumerated.";
      if (first.text) facts.push(["Pattern", <span className="break-all font-mono text-xs">{first.text}</span>]);
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
  facts.push(["Last confirmed", <Timestamp iso={first.last_confirmed_at} />]);
  return { d, sentence, facts: facts.slice(0, 3) };
}

function edgeSummary(e: VisualEdge, nodes: Map<GraphRef, GraphNode>) {
  const m = e.members[0];
  const from = nodes.get(m.from)?.label ?? "Source";
  // A `declares` line's first member is a grant into the statement; the
  // line itself ends at the resource.
  const toRef = (e.kind === "declares" ? e.to : m.to) as GraphRef;
  const to = nodes.get(toRef)?.label ?? "Target";
  const target = nodes.get(toRef);
  const facts: [string, ReactNode][] = [];
  let sentence: string;
  switch (e.kind) {
    case "declares": {
      const statements = e.summary?.statements ?? [];
      const policies = [...new Set(statements.flatMap((s) => s.members.map((x) => x.policy)).filter(Boolean))];
      const actions = [...new Set(statements.flatMap((s) => s.members.map((x) => x.label)).filter(Boolean))];
      const resTo = nodes.get(e.to as GraphRef);
      const what = resTo?.kind === "selector" ? "resources matching this pattern" : resTo?.kind === "exact" ? "this exact reference" : "this resource";
      const count = independentCount(e);
      sentence = `${count === 1 ? "A statement" : `${count} statements`} in ${policies.length ? policies.join(", ") : "a policy"} ${e.summary?.effect === "deny" ? "deny" : "list"} ${actions.join("; ") || "actions"} for ${what}.`;
      facts.push(["Holder", from]);
      facts.push([resTo?.kind === "selector" ? "Pattern" : "Resource", <span className="break-all font-mono text-xs">{resTo?.text ?? to}</span>]);
      if (e.summary?.exclusions.length)
        facts.push(["Except", <span className="break-all font-mono text-xs">{e.summary.exclusions.join(", ")}</span>]);
      break;
    }
    case "executes_as":
      sentence = `${from} is configured to run as ${to}.`;
      break;
    case "task_execution_role":
      sentence = `ECS uses ${to} to start ${from} — pulling images and writing logs. Its credentials are not available to the application.`;
      break;
    case "can_assume":
      sentence = `${to}'s trust policy names ${from}. Whether ${from} may call sts:AssumeRole was not checked.`;
      break;
    case "member_of":
      sentence = `${from} is a member of ${to}.`;
      break;
    case "grant":
      sentence = `${from} has a policy containing this statement${e.members.length > 1 ? ` — ${e.members.length} independent grants` : ""}.`;
      break;
    case "target":
      sentence = `The statement lists ${target?.kind === "selector" ? "this pattern" : "this reference"}.`;
      break;
    case "observed_access":
      sentence = `${from} has observed access to ${to}. The outcome is ${m.outcome ?? "not stated"}. This is not a declared grant.`;
      break;
    case "backed_by_directory":
      sentence = `${from} and ${to} are linked by directory backing. They stay two identities.`;
      break;
  }
  facts.push(["Last confirmed", <Timestamp iso={m.last_confirmed_at} />]);
  return { sentence, facts: facts.slice(0, 3), title: `${from} → ${to}`, type: edgeVerb(e) };
}

function LoadControls({ frontier, a }: { frontier: GraphFrontier[]; a: SelectionActions }) {
  if (!frontier.length) return null;
  return (
    <ul className="space-y-1 border-t border-(--color-border-subtle) pt-2 text-xs">
      {frontier.map((f) => {
        const c = a.stateOf(f);
        return (
          <li key={frontierKey(f)} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-(--color-text-muted)">{frontierLabel(f)}</span>
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
  let Icon = NODE_ICON.statement;
  let sentence: string;
  let facts: [string, ReactNode][];
  let claims: GraphRef[] = [];
  let uncertainty: string[] = [];
  let open: GraphRef | null = null;
  let body: ReactNode = null;

  if (subject.kind === "node") {
    const v = subject.visual;
    const s = nodeSummary(v, edges, nodes, rootAccountId);
    title = s.d.title;
    type = s.d.type;
    category = s.d.category;
    Icon = NODE_ICON[s.d.icon];
    sentence = s.sentence;
    facts = s.facts;
    uncertainty = s.d.notes.filter((n) => n.tone === "warning").map((n) => n.long);
    const first = v.members[0];
    if (!v.overflow && v.members.length === 1) {
      claims = [first.ref];
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
                <span className="min-w-0 truncate">{workloads ? m.label : [m.policy, m.sid ? `Sid ${m.sid}` : null].filter(Boolean).join(" · ") || "Statement"}</span>
                <button type="button" onClick={() => (workloads ? actions.onOpenObject(m.ref) : actions.onEvidence([m.ref]))} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">
                  {workloads ? "Open" : "Evidence"}
                </button>
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
        <LoadControls frontier={v.frontier} a={actions} />
      </>
    );
  } else {
    const e = subject.edge;
    const s = edgeSummary(e, nodes);
    title = s.title;
    type = s.type;
    sentence = s.sentence;
    facts = s.facts;
    // A declared relationship's evidence is each statement's claim that it
    // lists the resource (the target claims), one per independent statement.
    claims = e.kind === "declares" ? e.members.filter((m) => m.kind === "target").map((m) => m.claim) : e.members.map((m) => m.claim);
    uncertainty = markedLimitations(e).map(limitationText);
    if (e.state === "stale") uncertainty.unshift("Not reconfirmed by the latest scan.");
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
          <p className={cn("mb-1 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold", category ? CHIP[category] : "bg-(--color-surface-subtle) text-(--color-text-muted)")}>
            <Icon aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{type}</span>
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
