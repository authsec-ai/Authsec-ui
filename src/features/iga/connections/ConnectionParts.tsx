/** Small pieces both Connections screens share. */

import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import type { Connection } from "@/app/api/connectionsApi";
import { Button } from "@/components/ui/button";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { cn } from "@/lib/utils";

import { actionsOf, statusOf, type ActionSet } from "./connectionModel";
import { PENDING_WORD, type ActionFailure, type ActionKind } from "./useConnectionActions";

/** The primary condition in words, with a dot: colour is never the only signal. */
export function StatusBlock({ c, clamp = true }: { c: Connection; clamp?: boolean }) {
  const s = statusOf(c);
  return (
    <div className="min-w-0 space-y-1">
      <CloudPill tone={s.tone}>{s.label}</CloudPill>
      {s.support ? (
        <p className={cn("text-xs leading-snug text-muted-foreground", clamp && "line-clamp-2")} title={clamp ? s.support : undefined}>
          {s.support}
        </p>
      ) : null}
    </div>
  );
}

/** A toggle chip. `aria-pressed` says which is on; the bar's own chips do not. */
export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)",
        pressed
          ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {children}
    </div>
  );
}

const ACTION_WORD: Record<ActionKind, string> = { scan: "scan", verify: "verification", revoke: "change" };

/** Failed actions, each with its cause and a way to try again. Never a toast alone. */
export function ActionFailureList({
  failures,
  connections,
  onRetry,
  onDismiss,
}: {
  failures: ActionFailure[];
  connections: Connection[];
  onRetry: (c: Connection, kind: ActionKind) => void;
  onDismiss: (id: string, kind: ActionKind) => void;
}) {
  if (failures.length === 0) return null;
  return (
    <div className="space-y-2" role="alert">
      {failures.map((f) => {
        const c = connections.find((x) => x.id === f.id);
        return (
          <div
            key={`${f.id}:${f.kind}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs"
          >
            <span className="min-w-0 flex-1">
              <strong className="font-medium">
                {f.forbidden ? `${f.name}:` : `The ${ACTION_WORD[f.kind]} for ${f.name} did not complete.`}
              </strong>{" "}
              {f.message}
            </span>
            {c && !f.forbidden ? (
              <button type="button" className="font-semibold underline" onClick={() => onRetry(c, f.kind)}>
                Retry
              </button>
            ) : null}
            <button type="button" className="underline" onClick={() => onDismiss(f.id, f.kind)}>
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** What is happening to a connection right now, as words with a spinner. */
export function PendingWord({ kind }: { kind: ActionKind }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {PENDING_WORD[kind]}
    </span>
  );
}

/**
 * The detail page's action buttons: only the ones that exist for this
 * connection and this reader. A pending one says what is happening.
 */
export function ConnectionActionBar({
  c,
  canAdminister,
  pending,
  onRun,
  onEditScope,
}: {
  c: Connection;
  canAdminister: boolean;
  pending?: ActionKind;
  onRun: (kind: ActionKind) => void;
  onEditScope?: () => void;
}) {
  const a: ActionSet = actionsOf(c, canAdminister);
  return (
    <>
      {a.scan ? (
        <Button variant="outline" size="sm" disabled={!!pending} onClick={() => onRun("scan")}>
          {pending === "scan" ? PENDING_WORD.scan : "Scan now"}
        </Button>
      ) : null}
      {a.verify ? (
        <Button variant="outline" size="sm" disabled={!!pending} onClick={() => onRun("verify")}>
          {pending === "verify" ? PENDING_WORD.verify : "Verify"}
        </Button>
      ) : null}
      {a.editScope && onEditScope ? (
        <Button variant="outline" size="sm" disabled={!!pending} onClick={onEditScope}>
          Edit scope
        </Button>
      ) : null}
      {a.revoke ? (
        <Button
          variant="outline"
          size="sm"
          disabled={!!pending}
          className="border-(--color-danger-text)/30 text-(--color-danger-text) hover:bg-(--color-danger-soft) hover:text-(--color-danger-text)"
          onClick={() => onRun("revoke")}
        >
          {pending === "revoke" ? PENDING_WORD.revoke : c.provider === "aws" || c.provider === "gcp" ? "Revoke…" : "Remove connection…"}
        </Button>
      ) : null}
    </>
  );
}

export function NameLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block truncate font-medium text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
    >
      {children}
    </Link>
  );
}
