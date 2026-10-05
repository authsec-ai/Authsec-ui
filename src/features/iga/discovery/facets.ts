/**
 * Turning a server's `facets` into facet options with honest counts.
 *
 *   facets absent        the list has not answered: options show no count
 *   facets[key] === null the facet's count timed out: Unavailable, never 0
 *   facets[key] = [...]  a value with no entry is a true 0 — the query ran
 */

import type { GraphFacetValue } from "@/app/api/igaGraphApi";

import type { CountValue } from "../shared/components/countValue";
import type { FacetOption, FacetSpec } from "./FacetBar";
import type { Source } from "./sources";

type Facets = Record<string, GraphFacetValue[] | null> | undefined;

export interface FacetOptions {
  options: FacetOption[];
  countsUnavailable: boolean;
}

function countOf(list: GraphFacetValue[] | null | undefined, value: string): CountValue | undefined {
  if (list === undefined) return undefined;
  if (list === null) return { kind: "unavailable" };
  const hit = list.find((v) => v.value === value);
  return { kind: "exact", value: hit?.count ?? 0 };
}

/** Options the product defines (classification, kind …), with the server's count for each. */
export function fixedFacet(facets: Facets, key: string, values: { value: string; label: string }[]): FacetOptions {
  const list = facets?.[key];
  return {
    options: values.map((v) => ({ ...v, count: facets ? countOf(list, v.value) : undefined })),
    countsUnavailable: list === null,
  };
}

/** Options the data defines (region, service …): what the server reported. */
export function reportedFacet(facets: Facets, key: string, labelFor?: (value: string, serverLabel: string) => string): FacetOptions {
  const list = facets?.[key];
  if (!list) return { options: [], countsUnavailable: list === null };
  return {
    options: list.map((v) => ({ value: v.value, label: labelFor ? labelFor(v.value, v.label) : v.label, count: { kind: "exact", value: v.count } })),
    countsUnavailable: false,
  };
}

/**
 * The Source facet: the provider's connections (revoked ones listed and marked),
 * each with the count the server reports for its scope id. `reported` is the
 * server's facet keyed by scope id; null when it timed out; undefined when the
 * list has not answered or the facet does not exist for this list.
 */
export function sourceFacet(sources: Source[], reported: GraphFacetValue[] | null | undefined): FacetOptions {
  return {
    options: sources.map((s) => ({
      value: s.id,
      label: s.revoked ? `${s.label} (revoked)` : s.label,
      count: s.scopeId ? countOf(reported, s.scopeId) : undefined,
    })),
    countsUnavailable: reported === null,
  };
}

/** "Region: eu-west-1" — a facet in force, as the empty state names what narrows the list. */
export function facetSummary(f: FacetSpec): string {
  if (f.kind === "toggle" || f.value === undefined) return f.label;
  return `${f.label}: ${f.options?.find((o) => o.value === f.value)?.label ?? f.value}`;
}
