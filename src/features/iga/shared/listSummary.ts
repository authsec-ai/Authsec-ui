/**
 * How the graph lists name accounts and state completeness
 * (SPEC-iga-phase2-graph.md §2.14.7, §2.14.10).
 */

import { useMemo } from "react";

import type { GraphCoverageGap, GraphFacetValue, GraphListMeta, Pipeline } from "@/app/api/igaGraphApi";

import { INCOMPLETE_STATES } from "./labels";

/** Account id → the name the customer gave it, from the pipeline and the facets. */
export function useAccountNames(pipeline: Pipeline | undefined, accountFacet: GraphFacetValue[] | undefined) {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const a of pipeline?.accounts ?? []) m.set(a.account_id, a.label);
    for (const f of accountFacet ?? []) if (!m.has(f.value) && f.value !== "unknown") m.set(f.value, f.label);
    return (id: string) => m.get(id) ?? id;
  }, [pipeline?.accounts, accountFacet]);
}

/** Accounts whose collection left rows missing — never inferred from row counts. */
export function incompleteAccounts(gaps: GraphCoverageGap[], nameOf: (id: string) => string): string[] {
  return [...new Set(gaps.filter((g) => INCOMPLETE_STATES.has(g.state)).map((g) => nameOf(g.account_id)))];
}

/**
 * The header's one-line summary. "Complete" is said only of a result that was
 * read and carries no gap; while loading or after a failure nothing is said.
 * Under an account filter the result's coverage only speaks for that account,
 * so the claim is scoped to it rather than to every connected account.
 */
export function coverageSummary(
  meta: GraphListMeta | undefined,
  accounts: number,
  incomplete: string[],
  filteredAccount?: string,
): string | undefined {
  if (!accounts) return undefined;
  const n = filteredAccount ?? `${accounts} AWS ${accounts === 1 ? "account" : "accounts"}`;
  if (!meta || meta.graph_state !== "published") return n;
  if (filteredAccount) return incomplete.length ? `${n} · incomplete` : `${n} · complete`;
  return incomplete.length ? `${n} · ${incomplete.length} incomplete` : `${n} · complete`;
}

/**
 * The Empty copy when nothing narrows the list. Empty means "we looked,
 * completely, and there is nothing" — with a coverage gap, it names the gap
 * instead of claiming a full read.
 */
export function unfilteredEmpty(subject: string, incomplete: string[]): string {
  return incomplete.length
    ? `None were found in what could be read. Collection is incomplete for ${incomplete.join(", ")} — see the gaps above.`
    : `The connected accounts were read, and no ${subject} were found.`;
}

/**
 * A tab's Empty answer, honest about coverage: with a gap in the result's
 * `meta.coverage`, "none" only describes what could be read (§2.14.7).
 */
export function emptyGiven(empty: string, gaps: GraphCoverageGap[] | undefined): string {
  const incomplete = incompleteAccounts(gaps ?? [], (id) => id);
  return incomplete.length
    ? `None found in what could be read. Collection is incomplete for ${incomplete.join(", ")}, so this may not be the whole answer.`
    : empty;
}
