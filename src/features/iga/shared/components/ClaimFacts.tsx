import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";

import type { Basis, GraphRef, RelState } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { useEvidence } from "../../evidence/useEvidence";
import { BASIS_EXPLANATION, RELATIONSHIP_LABEL, REL_STATE_TONE } from "../labels";

/**
 * One claim's facts on one line: its type, basis, lifecycle and last
 * confirmation as SEPARATE facts (§2.14.9) — never one combined tone — and
 * the way to its evidence. Effective access is never shown as known.
 */
export function ClaimFacts({
  claim,
  type,
  basis,
  state,
  confirmedAt,
  claims,
}: {
  claim?: GraphRef;
  type?: string;
  basis?: Basis;
  /** Omitted when the response does not state it; never guessed. */
  state?: RelState;
  confirmedAt?: string | null;
  /** Several claims behind one line (two statements declaring one grant). */
  claims?: GraphRef[];
}) {
  const { open } = useEvidence();
  const refs = claims ?? (claim ? [claim] : []);
  // Said in words, never as the API's enum. Basis and lifecycle stay two
  // facts (§2.14.9); lifecycle is plain words when current and a badge only
  // when it needs attention (stale, ended).
  const parts: ReactNode[] = [];
  if (type) parts.push(<span key="type">{sentence(RELATIONSHIP_LABEL[type] ?? type)}</span>);
  if (basis)
    parts.push(
      <span key="basis" title={BASIS_EXPLANATION[basis]} className="cursor-help underline decoration-dotted decoration-(--color-border-strong) underline-offset-2">
        {sentence(basis)}
      </span>,
    );
  if (state === "current") parts.push(<span key="state">Current</span>);
  if (confirmedAt) parts.push(<span key="at">Confirmed {formatDistanceToNow(new Date(confirmedAt), { addSuffix: true })}</span>);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-text-muted)">
      {state && state !== "current" ? <StatusBadge tone={REL_STATE_TONE[state]}>{state}</StatusBadge> : null}
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 ? <span aria-hidden="true" className="text-(--color-text-subtle)">·</span> : null}
          {p}
        </span>
      ))}
      {refs.length ? (
        <button type="button" onClick={() => open(refs)} className="font-medium text-(--color-primary-text) hover:underline">
          Evidence
        </button>
      ) : null}
    </div>
  );
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
