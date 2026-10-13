/**
 * One policy, opened from the list: who, what and when in a few lines, where it
 * stands in its window, and the documents AWS would see. Edit, pause or resume,
 * and delete are here.
 */

import { Database, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { useGetPolicyDemoQuery, type PolicyDemo } from "@/app/api/policyDemoApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { GeneratedDocs } from "./GeneratedDocs";
import { PhaseChip } from "./PolicyStatus";
import { actionLabel, resourceLabel, whenText, windowLength, windowProgress, windowText } from "./policyDemoModel";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 text-[13px]">
      <dt className="w-24 shrink-0 text-(--color-text-muted)">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-(--color-text)">{children}</dd>
    </div>
  );
}

export function PolicyDetailSheet({
  policy,
  onClose,
  onEdit,
  onTogglePause,
  onDelete,
}: {
  policy: PolicyDemo | null;
  onClose: () => void;
  onEdit: (p: PolicyDemo) => void;
  onTogglePause: (p: PolicyDemo) => void;
  onDelete: (p: PolicyDemo) => void;
}) {
  const full = useGetPolicyDemoQuery(policy?.id ?? "", { skip: !policy });
  // The list row is shown at once; the read adds the documents and keeps it current.
  const p = full.data ?? policy;
  const progress = p ? windowProgress(p) : null;

  return (
    <Sheet open={!!policy} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b border-(--color-border-subtle) px-5 py-4">
          <div className="flex items-center gap-2 pr-8">
            {p ? <PhaseChip phase={p.phase} /> : null}
            <span className="text-xs text-(--color-text-muted)">{p ? whenText(p) : ""}</span>
          </div>
          <SheetTitle className="text-base">{p?.name ?? "Policy"}</SheetTitle>
          <SheetDescription className="text-xs text-(--color-text-muted)">
            {p?.description || "A time-boxed access policy for an agent. Nothing is applied to AWS in this demo."}
          </SheetDescription>
        </SheetHeader>

        {p ? (
          <div className="space-y-5 px-5 py-4">
            <dl className="space-y-2">
              <Row label="Agent">{p.agent}</Row>
              <Row label="Acts as">{p.identity}</Row>
              <Row label="Resource">
                <span className="inline-flex items-center gap-1.5">
                  <Database aria-hidden="true" className="size-3.5 text-(--color-text-muted)" />
                  <span className="font-mono text-xs">s3://{resourceLabel(p)}</span>
                </span>
              </Row>
              <Row label="Access">
                <span className="flex flex-wrap gap-1.5">
                  {p.actions.map((a) => (
                    <span key={a} className="rounded border border-(--color-border-subtle) bg-(--color-surface-subtle) px-1.5 py-0.5 text-xs font-medium">
                      {actionLabel(a)}
                    </span>
                  ))}
                </span>
              </Row>
              <Row label="Window">
                {windowText(p)}
                {windowLength(p) ? <span className="text-(--color-text-muted)"> · {windowLength(p)}</span> : null}
              </Row>
            </dl>

            {progress !== null ? (
              <div className="space-y-1" aria-label="Where this policy is in its window">
                <div className="h-1.5 overflow-hidden rounded-full bg-(--color-surface-subtle)">
                  <div
                    className={cn("h-full rounded-full", p.phase === "expired" ? "bg-(--color-text-subtle)" : "bg-(--color-primary)")}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-(--color-text-muted)">
                  <span>Start</span>
                  <span>End</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                <Pencil aria-hidden="true" className="size-3.5" />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => onTogglePause(p)}>
                {p.paused ? <Play aria-hidden="true" className="size-3.5" /> : <Pause aria-hidden="true" className="size-3.5" />}
                {p.paused ? "Resume" : "Pause"}
              </Button>
              <Button size="sm" variant="outline" className="text-(--color-danger-text)" onClick={() => onDelete(p)}>
                <Trash2 aria-hidden="true" className="size-3.5" />
                Delete
              </Button>
            </div>

            <div className="space-y-2 border-t border-(--color-border-subtle) pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">What AWS would see</h3>
              <GeneratedDocs docs={p.generated} busy={full.isFetching && !p.generated} />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
