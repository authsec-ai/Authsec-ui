import { formatDistanceToNow } from "date-fns";

import type { Basis, GraphRef, RelState } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { useEvidence } from "../../evidence/useEvidence";
import { REL_STATE_TONE } from "../labels";

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
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-(--color-text-muted)">
      {type ? <span className="font-mono">{type}</span> : null}
      {basis ? (
        <>
          {type ? <span aria-hidden>·</span> : null}
          <span>{basis}</span>
        </>
      ) : null}
      {state ? (
        <>
          {type || basis ? <span aria-hidden>·</span> : null}
          <StatusBadge tone={REL_STATE_TONE[state]}>{state}</StatusBadge>
        </>
      ) : null}
      {confirmedAt ? (
        <>
          <span aria-hidden>·</span>
          <span>confirmed {formatDistanceToNow(new Date(confirmedAt), { addSuffix: true })}</span>
        </>
      ) : null}
      {refs.length ? (
        <button
          type="button"
          onClick={() => open(refs)}
          className="ml-1 font-semibold text-(--color-primary-text) hover:underline"
        >
          Evidence
        </button>
      ) : null}
    </p>
  );
}
