/**
 * The four states a count can be in (SPEC-console-revamp.md *Count semantics*),
 * kept apart so no screen can fold one into another:
 *
 *   exact         `23`            the query established this number
 *   at_least      `At least 23`   a lower bound (a capped list, a partial read)
 *   unavailable   `Unavailable`   the count timed out, or the provider does not report it
 *   0 is `exact` with value 0     a successful query established no matches
 *
 * `loading` is not a count: it is the absence of an answer yet.
 *
 * Nothing here ever derives a number from a page of rows in hand, and a cursor
 * is never turned into a count.
 */

import type { ExactCount } from "@/app/api/igaGraphApi";

export type CountValue =
  | { kind: "exact"; value: number }
  | { kind: "at_least"; value: number }
  | { kind: "unavailable" }
  | { kind: "loading" };

export const COUNT_LOADING: CountValue = { kind: "loading" };
export const COUNT_UNAVAILABLE: CountValue = { kind: "unavailable" };

/** An API `ExactCount`: `value: null` is unknown, never zero. */
export function countOfExact(c: ExactCount | null | undefined): CountValue {
  if (!c || c.value == null) return COUNT_UNAVAILABLE;
  return c.exact ? { kind: "exact", value: c.value } : { kind: "at_least", value: c.value };
}

/** The paging fields of a graph or inventory list's `meta` (§5.2). */
export function countOfMeta(
  meta: { total_known?: boolean; total?: number; total_at_least?: number } | null | undefined,
): CountValue {
  if (!meta) return COUNT_UNAVAILABLE;
  if (meta.total_known && meta.total !== undefined) return { kind: "exact", value: meta.total };
  if (meta.total_at_least !== undefined) return { kind: "at_least", value: meta.total_at_least };
  return COUNT_UNAVAILABLE;
}

/** The count in words, for a sentence or an accessible label. */
export function countWords(c: CountValue): string {
  switch (c.kind) {
    case "exact":
      return c.value.toLocaleString();
    case "at_least":
      return `At least ${c.value.toLocaleString()}`;
    case "unavailable":
      return "Unavailable";
    case "loading":
      return "Loading";
  }
}

/** "3 workloads", "At least 3 workloads", "Unavailable" — a count with its noun. */
export function countWithNoun(c: CountValue, one: string, many: string): string {
  if (c.kind === "unavailable" || c.kind === "loading") return countWords(c);
  return `${countWords(c)} ${c.value === 1 && c.kind === "exact" ? one : many}`;
}
