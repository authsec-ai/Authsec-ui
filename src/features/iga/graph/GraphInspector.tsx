/**
 * The graph inspector (SPEC-iga-phase2-graph.md §2.14.7, §2.14.11): the one
 * panel beside the canvas for whatever is selected — a card, or a
 * relationship and its evidence. Closed until something is selected, unless
 * the URL asks for evidence.
 *
 * Its header — what is selected, and Close — stays in view while the body
 * scrolls; the body starts at the top again for each new selection. Beside
 * the canvas when there is room for both, a drawer over it when there is
 * not (the caller decides, from the workspace's own width). Escape inside it
 * closes it; the caller returns focus to the card or line it came from.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

import { objectPath, refType, type GraphFrontier, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { CopyField } from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { DeclaredAccessNotice, EvidenceClaims, type ClaimContext } from "../evidence/EvidenceClaim";
import { REL_STATE_TONE, accountWithId, limitationText } from "../shared/labels";
import { Timestamp } from "../shared/components/Timestamp";
import { EDGE_LABEL, KIND_LABEL, edgeVerb, frontierLabel } from "./graphLabels";
import { describeNode } from "./nodeView";
import { NODE_ICON } from "./icons";
import { frontierKey, type FrontierControl, type VisualEdge, type VisualNode } from "./types";

export type InspectorSubject =
  | { kind: "node"; visual: VisualNode }
  | { kind: "evidence"; claims: GraphRef[]; edge?: VisualEdge; fromNode?: VisualNode };

export interface InspectorActions {
  onClose: () => void;
  /** Evidence opened from a card: go back to the card. */
  onBackToNode: () => void;
  onOpenObject: (ref: GraphRef) => void;
  onFocusHere: (ref: GraphRef) => void;
  onEvidence: (claims: GraphRef[]) => void;
  onShowBranch: (overflowId: string, select?: string) => void;
  onHideBranch: (overflowId: string) => void;
  onShowWorkloads: (refs: GraphRef[]) => void;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
}

/** A card's account line: applicable and known, applicable and unknown, or not applicable. */
function accountLine(n: GraphNode): string {
  const known = accountWithId(n.account);
  if (known) return n.account && !n.account.connected ? `${known} — not connected` : known;
  if (n.kind === "statement") return "Not applicable — the statement's policy belongs to its holder";
  if (n.kind === "selector" || n.kind === "exact" || n.kind === "external") return "Not stated by the reference";
  if (n.kind === "external_principal") return "Not applicable to this kind of principal";
  return "Not known";
}

function Field({ label, children, wide = true }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="mb-0.5 text-[11px] font-medium text-(--color-text-muted)">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-(--color-text)">{children}</dd>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-(--color-text-muted)">{label}</h3>
      {children}
    </section>
  );
}

function FrontierControls({ frontier, a }: { frontier: GraphFrontier[]; a: InspectorActions }) {
  if (!frontier.length) return null;
  return (
    <Section label="Not loaded yet">
      <ul className="space-y-1.5 text-sm">
        {frontier.map((f) => {
          const c = a.stateOf(f);
          return (
            <li key={frontierKey(f)} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-(--color-text-muted)">{frontierLabel(f)}</span>
              {c.pending === "paused" ? (
                <Button size="sm" variant="outline" onClick={a.onRefresh}>Refresh first</Button>
              ) : c.pending === "loading" ? (
                <span className="text-xs text-(--color-text-muted)">Loading…</span>
              ) : c.expanded ? (
                <span className="flex gap-1.5">
                  {a.canLoadMore(f) ? (
                    <Button size="sm" variant="outline" onClick={() => a.onLoadMore(f)}>
                      {c.pending === "failed" ? "Retry" : "Load more"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => a.onCollapse(f)}>Collapse</Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => a.onExpand(f)}>
                  {c.pending === "failed" ? "Retry" : "Load"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function NodeBody({ visual: v, rootAccountId, a }: { visual: VisualNode; rootAccountId: string | null; a: InspectorActions }) {
  const first = v.members[0];
  const d = describeNode(v, rootAccountId);

  if (v.overflow) {
    const o = v.overflow;
    const count = o.hidden.reduce((n, h) => n + h.members.length, 0);
    return (
      <div className="space-y-5">
        <p className="text-sm text-(--color-text-muted)">
          {count} loaded {EDGE_LABEL[o.edgeKind]} relationships are hidden to keep the view readable
          {o.beyond ? `, with ${o.beyond} more objects reached only through them` : ""}. Nothing is missing from the
          evidence: each is listed here and in Paths.
          {o.moreNotLoaded ? " More of these exist that are not loaded yet; the parent's Load control fetches them." : ""}
        </p>
        <Button size="sm" onClick={() => a.onShowBranch(v.id)}>
          Show all {count} on the canvas
        </Button>
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
          {o.hidden.map((h) => {
            const hd = describeNode(h, rootAccountId);
            return (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={hd.title}>{hd.title}</span>
                  <span className="block truncate text-xs text-(--color-text-muted)">{[hd.type, hd.context].filter(Boolean).join(" · ")}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => a.onShowBranch(v.id, h.id)}>Show</Button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (v.members.length > 1) {
    const workloads = first.kind === "workload";
    return (
      <div className="space-y-5">
        <p className="text-sm text-(--color-text-muted)">
          {workloads
            ? `${v.members.length} workloads are configured to run as the same identity. They are drawn as one card; each keeps its own evidence.`
            : `${v.members.length} statements declare the same grant — same actions, targets, effect, conditions and lifecycle. Each is a separate grant with its own evidence.`}
        </p>
        {workloads ? (
          <Button size="sm" variant="outline" onClick={() => a.onShowWorkloads(v.members.map((m) => m.ref))}>
            Draw each workload
          </Button>
        ) : null}
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
          {v.members.map((m) => (
            <li key={m.ref} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{workloads ? m.label : m.policy ?? "Policy"}</span>
                <span className="block truncate text-xs text-(--color-text-muted)">
                  {workloads ? accountLine(m) : [m.sid ? `Sid ${m.sid}` : null, m.effect].filter(Boolean).join(" · ") || "Statement"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {m.state !== "current" ? <StatusBadge tone={REL_STATE_TONE[m.state]}>{m.state}</StatusBadge> : null}
                {workloads && objectPath(m.ref) ? (
                  <Button size="sm" variant="ghost" onClick={() => a.onOpenObject(m.ref)}>Open</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => a.onEvidence([m.ref])}>Evidence</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <FrontierControls frontier={v.frontier} a={a} />
      </div>
    );
  }

  const path = objectPath(first.ref);
  const canFocus = !!path && refType(first.ref) !== "external_principal";
  const limitations = (first.limitations ?? []).filter((l) => l.code !== "effective_access_not_evaluated");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {path ? <Button size="sm" onClick={() => a.onOpenObject(first.ref)}>Open</Button> : null}
        {canFocus ? <Button size="sm" variant="outline" onClick={() => a.onFocusHere(first.ref)}>Graph from here</Button> : null}
        <Button size="sm" variant="outline" onClick={() => a.onEvidence([first.ref])}>Evidence</Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Type" wide={false}>{d.type}</Field>
        <Field label="State" wide={false}>
          <StatusBadge tone={REL_STATE_TONE[first.state]}>{first.state}</StatusBadge>
        </Field>
        <Field label="Account">{accountLine(first)}</Field>
        {first.kind === "statement" && first.policy ? (
          <Field label="Policy">
            {first.policy}
            {first.sid ? ` · Sid ${first.sid}` : first.index != null ? ` · statement ${first.index + 1}` : ""}
          </Field>
        ) : null}
        {first.effect ? <Field label="Effect" wide={false}>{first.effect === "deny" ? "Deny" : "Allow"} (as written; not a decision)</Field> : null}
        {first.used_by_count && first.kind !== "workload" ? (
          <Field label="Direct workload bindings">
            {first.used_by_count.value == null
              ? "Not known"
              : `${first.used_by_count.exact ? "" : "At least "}${first.used_by_count.value} workload${first.used_by_count.value === 1 ? "" : "s"} configured to run as it`}
            <span className="block text-xs text-(--color-text-muted)">Counts direct execution-role bindings only, not workloads reaching it through other roles.</span>
          </Field>
        ) : null}
        {first.restrictions?.permissions_boundary ? <Field label="Permissions boundary">Recorded; not evaluated</Field> : null}
        {first.restrictions?.deny_statements ? <Field label="Deny statements">{first.restrictions.deny_statements} recorded; not evaluated</Field> : null}
        {first.exclusions?.length ? <Field label="Except">{first.exclusions.map((x) => x.text).join(", ")}</Field> : null}
        {first.resolution ? (
          <Field label="Resolution">
            {first.resolution.state.replace(/_/g, " ")}
            {first.resolution.rule ? ` · ${first.resolution.rule.replace(/_/g, " ")}` : ""}
          </Field>
        ) : null}
        {first.issuer ? <Field label="Issuer">{first.issuer}</Field> : null}
        {first.subject ? <Field label="Subject">{first.subject}</Field> : null}
        <Field label="Last confirmed" wide={false}><Timestamp iso={first.last_confirmed_at} /></Field>
        {first.arn ? <CopyField label="ARN" value={first.arn} /> : null}
        {!first.arn && first.text && first.text !== first.label ? <CopyField label="Reference" value={first.text} /> : null}
      </dl>

      {d.indicators.length || limitations.length ? (
        <Section label="Worth knowing">
          <ul className="list-disc space-y-1 pl-5 text-sm text-(--color-text-muted)">
            {d.indicators.map((i) => <li key={i.key}>{i.long}.</li>)}
            {limitations.map((l, i) => <li key={`${l.code}-${i}`}>{limitationText(l)}</li>)}
          </ul>
        </Section>
      ) : null}

      <FrontierControls frontier={v.frontier} a={a} />
    </div>
  );
}

export function GraphInspector({
  ws,
  subject,
  nodes,
  rootAccountId,
  presentation,
  width,
  modal,
  actions,
}: {
  ws: string;
  subject: InspectorSubject;
  /** Every loaded node, to name a claim's two ends. */
  nodes: Map<GraphRef, GraphNode>;
  rootAccountId: string | null;
  presentation: "inline" | "drawer";
  width: number;
  /** Drawer only: trap focus (a narrow window). */
  modal: boolean;
  actions: InspectorActions;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key =
    subject.kind === "node" ? `node:${subject.visual.id}` : `evidence:${subject.claims.join(",")}`;

  // A different selection starts at the top; an update to the same one keeps its place.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [key]);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  let title: string;
  let subtitle: string;
  let Icon = NODE_ICON.statement;
  if (subject.kind === "node") {
    const d = describeNode(subject.visual, rootAccountId);
    title = d.title;
    subtitle = d.type;
    Icon = NODE_ICON[d.icon];
  } else if (subject.edge) {
    const e = subject.edge;
    const from = nodes.get(e.members[0].from)?.label ?? "Source";
    const to = nodes.get(e.members[0].to)?.label ?? "Target";
    title = `${from} → ${to}`;
    subtitle = `${edgeVerb(e)}${e.members.length > 1 ? ` · ${e.members.length} ${e.kind === "grant" ? "independent grants" : "relationships"}` : ""}`;
  } else {
    const n = subject.claims.length === 1 ? nodes.get(subject.claims[0]) : undefined;
    title = n ? n.label : subject.claims.length === 1 ? "Evidence" : `${subject.claims.length} claims`;
    subtitle = n ? `Evidence · ${KIND_LABEL[n.kind]}` : "Why the product shows this";
  }

  const contextOf = (claim: GraphRef): ClaimContext | undefined => {
    const m = subject.kind === "evidence" ? subject.edge?.members.find((x) => x.claim === claim) : undefined;
    if (!m) return undefined;
    return { relationship: EDGE_LABEL[m.kind], source: nodes.get(m.from)?.label, target: nodes.get(m.to)?.label };
  };

  const header = (
    <header className="flex shrink-0 items-start gap-2 border-b border-(--color-border-subtle) px-4 py-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-text-muted)" />
      <div className="min-w-0 flex-1">
        {subject.kind === "evidence" && subject.fromNode ? (
          <button type="button" onClick={actions.onBackToNode} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-primary-text) hover:underline">
            <ArrowLeft className="size-3" /> {describeNode(subject.fromNode, rootAccountId).title}
          </button>
        ) : null}
        <h2 ref={headingRef} tabIndex={-1} id="graph-inspector-heading" className="break-words text-sm font-semibold leading-snug text-(--color-text) outline-none">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-(--color-text-muted)">{subtitle}</p>
      </div>
      <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0" onClick={actions.onClose} aria-label="Close inspector">
        <X className="size-4" />
      </Button>
    </header>
  );

  const body = (
    <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {subject.kind === "node" ? (
        <NodeBody visual={subject.visual} rootAccountId={rootAccountId} a={actions} />
      ) : (
        <div className="space-y-4">
          <DeclaredAccessNotice />
          <EvidenceClaims ws={ws} claims={subject.claims} contextOf={contextOf} grants={subject.edge?.kind === "grant"} />
        </div>
      )}
    </div>
  );

  if (presentation === "drawer") {
    return (
      <Sheet open modal={modal} onOpenChange={(o) => { if (!o) actions.onClose(); }}>
        <SheetContent
          side="right"
          hideClose
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => { if (!modal) event.preventDefault(); }}
          aria-describedby={undefined}
          className={cn("gap-0 p-0", modal ? "w-full max-w-none sm:max-w-none" : "sm:max-w-none")}
          style={modal ? undefined : { width }}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{subtitle}</SheetDescription>
          {header}
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-labelledby="graph-inspector-heading"
      style={{ width }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          actions.onClose();
        }
      }}
      className="flex min-h-0 shrink-0 flex-col border-l border-(--color-border-subtle) bg-(--color-surface-raised)"
    >
      {header}
      {body}
    </aside>
  );
}
