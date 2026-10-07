/** Small pieces both Connections screens share. */

import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, MoreHorizontal } from "lucide-react";

import type { Connection } from "@/app/api/connectionsApi";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { cn } from "@/lib/utils";

import { actionsOf, statusOf, type ActionSet } from "./connectionModel";
import { PENDING_WORD, type ActionFailure, type ActionKind } from "./useConnectionActions";

/** The primary condition in words, with a dot: colour is never the only signal. */
export function StatusBlock({ c, clamp = true, pill = true }: { c: Connection; clamp?: boolean; pill?: boolean }) {
  const s = statusOf(c);
  return (
    <div className="min-w-0 space-y-1">
      {pill ? <CloudPill tone={s.tone}>{s.label}</CloudPill> : null}
      {s.support ? (
        <p className={cn("text-xs leading-snug text-muted-foreground", clamp && "line-clamp-2")} title={clamp ? s.support : undefined}>
          {s.support}
        </p>
      ) : null}
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
/**
 * The detail header's actions. Two stay on the bar — Scan now and the page's
 * primary action (`primary`, Open in Discovery) — and the rest go in a
 * "More actions" menu, Revoke last and in red (D-02). Five equal buttons in a
 * row gave a destructive action the same weight as a refresh.
 */
export function ConnectionActionBar({
  c,
  canAdminister,
  pending,
  onRun,
  onEditScope,
  primary,
}: {
  c: Connection;
  canAdminister: boolean;
  pending?: ActionKind;
  onRun: (kind: ActionKind) => void;
  onEditScope?: () => void;
  /** The page's main action, drawn between Scan now and the menu. */
  primary?: ReactNode;
}) {
  const a: ActionSet = actionsOf(c, canAdminister);
  const editScope = a.editScope && onEditScope;
  const more = a.verify || editScope || a.revoke;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.scan ? (
        <Button variant="outline" size="sm" disabled={!!pending} onClick={() => onRun("scan")}>
          {pending === "scan" ? PENDING_WORD.scan : "Scan now"}
        </Button>
      ) : null}
      {primary}
      {more ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2" disabled={!!pending} aria-label="More actions" title="More actions">
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {a.verify ? <DropdownMenuItem onSelect={() => onRun("verify")}>Verify connection</DropdownMenuItem> : null}
            {editScope ? <DropdownMenuItem onSelect={onEditScope}>Edit scope</DropdownMenuItem> : null}
            {a.revoke ? (
              <>
                {a.verify || editScope ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onSelect={() => onRun("revoke")}
                  className="text-(--color-danger-text) focus:bg-(--color-danger-soft) focus:text-(--color-danger-text)"
                >
                  {c.provider === "aws" || c.provider === "gcp" ? "Revoke…" : "Remove connection…"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function NameLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      data-name-link
      className="block truncate font-medium text-(--color-primary-text) hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
    >
      {children}
    </Link>
  );
}
