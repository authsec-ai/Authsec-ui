/**
 * The graph's evidence panel (SPEC-iga-phase2-graph.md §2.14.7, §2.14.11):
 * the deeper layer behind the selection card's View evidence. It replaces
 * the card — one inspection layer at a time — and Back returns to it.
 *
 * Beside the canvas when there is room for both, a drawer over it when there
 * is not (the caller decides, from the workspace's own width). Its header
 * stays in view while the body scrolls, and a different selection starts at
 * the top. Escape inside it goes back one layer.
 */

import { useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

import type { GraphNode, GraphRef } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { DeclaredAccessNotice, EvidenceClaims, type ClaimContext } from "../evidence/EvidenceClaim";
import { EDGE_LABEL, KIND_LABEL, edgeVerb } from "./graphLabels";
import type { VisualEdge } from "./types";

export interface EvidenceSubject {
  claims: GraphRef[];
  /** The line the claims belong to, when they came from one. */
  edge?: VisualEdge;
  /** A selection card to go back to. */
  backTo?: string;
}

export function GraphInspector({
  ws,
  subject,
  nodes,
  presentation,
  width,
  modal,
  onClose,
  onBack,
}: {
  ws: string;
  subject: EvidenceSubject;
  /** Every loaded node, to name a claim's two ends. */
  nodes: Map<GraphRef, GraphNode>;
  presentation: "inline" | "drawer";
  width: number;
  /** Drawer only: trap focus (a narrow window). */
  modal: boolean;
  onClose: () => void;
  onBack: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key = subject.claims.join(",");
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  let title: string;
  let subtitle: string;
  if (subject.edge) {
    const m = subject.edge.members[0];
    title = `${nodes.get(m.from)?.label ?? "Source"} → ${nodes.get(subject.edge.to as GraphRef)?.label ?? nodes.get(m.to)?.label ?? "Target"}`;
    subtitle = `Evidence · ${edgeVerb(subject.edge)}`;
  } else {
    const n = subject.claims.length === 1 ? nodes.get(subject.claims[0]) : undefined;
    title = n ? n.label : `${subject.claims.length} claims`;
    subtitle = n ? `Evidence · ${KIND_LABEL[n.kind]}` : "Evidence";
  }

  const contextOf = (claim: GraphRef): ClaimContext | undefined => {
    const m = subject.edge?.members.find((x) => x.claim === claim);
    if (!m) return undefined;
    return { relationship: EDGE_LABEL[m.kind], source: nodes.get(m.from)?.label, target: nodes.get(m.to)?.label };
  };
  const grants = subject.edge?.kind === "grant" || subject.edge?.kind === "declares";

  const header = (
    <header className="flex shrink-0 items-start gap-2 border-b border-(--color-border-subtle) px-4 py-3">
      <div className="min-w-0 flex-1">
        {subject.backTo ? (
          <button type="button" onClick={onBack} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-primary-text) hover:underline">
            <ArrowLeft className="size-3" /> {subject.backTo}
          </button>
        ) : null}
        <h2 ref={headingRef} tabIndex={-1} id="graph-evidence-heading" className="break-words text-[15px] font-semibold leading-snug text-(--color-text) outline-none">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-(--color-text-muted)">{subtitle}</p>
      </div>
      <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0" onClick={onClose} aria-label="Close evidence">
        <X className="size-4" />
      </Button>
    </header>
  );

  const body = (
    <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <DeclaredAccessNotice />
      <EvidenceClaims ws={ws} claims={subject.claims} contextOf={contextOf} grants={grants} />
    </div>
  );

  if (presentation === "drawer") {
    return (
      <Sheet open modal={modal} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent
          side="right"
          hideClose
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Escape goes back one layer — to the card — as it does inline.
          onEscapeKeyDown={(event) => {
            if (!subject.backTo) return;
            event.preventDefault();
            onBack();
          }}
          onInteractOutside={(event) => { if (!modal) event.preventDefault(); }}
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
      aria-labelledby="graph-evidence-heading"
      style={{ width }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          if (subject.backTo) onBack();
          else onClose();
        }
      }}
      className="flex min-h-0 shrink-0 flex-col border-l border-(--color-border-subtle) bg-(--color-surface-raised)"
    >
      {header}
      {body}
    </aside>
  );
}
