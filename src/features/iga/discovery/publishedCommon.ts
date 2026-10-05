/**
 * What the three Published lists share: the graph revision, paging and capability
 * gate, the list-chrome column menu, the Source facet and the lifecycle options.
 */
import { useState } from "react";
import type { GraphListMeta } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";

import { usePipeline } from "../pipeline/usePipeline";
import { useGraphFeature } from "../shared/capabilities";
import { accountCoverageNote } from "../shared/lifecycle";
import { usePaging } from "../shared/paging";
import { useGraphRevision } from "../shared/revision";
import type { FacetOptions } from "./facets";
import type { FacetSpec } from "./FacetBar";
import type { ScreenProps } from "./screenTypes";

export function valid<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export const LIFECYCLE_OPTIONS = [
  { value: "retired", label: "Retired" },
  { value: "all", label: "All (active and retired)" },
] as const;

export const LIFECYCLE_NOTE = "Active includes current and stale rows; a stale row says so and is never hidden or removed. Retired rows are objects no scan confirms any more.";

/** Was this row's account not fully read? One test for every type, from the list's own coverage notes. */
export function accountHasGap(meta: GraphListMeta | undefined, account: { id: string } | null | undefined): boolean {
  return accountCoverageNote(meta?.coverage, account?.id) !== null;
}

export function usePublishedCommon(p: ScreenProps, feature: "workloads" | "identities" | "resources") {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(p.ws);
  const gate = useGraphFeature(p.ws, feature);
  const paging = usePaging(`discovery-${feature}`, epoch);
  const pipeline = usePipeline(p.ws, gate.off);
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const account = p.scope.kind === "one" ? [p.scope.source.scopeId] : undefined;
  return { dispatch, rev, epoch, refresh, gate, paging, pipeline, blocked, account };
}
export type Common = ReturnType<typeof usePublishedCommon>;

export function useListChrome<T>(tableId: string, columns: AdaptiveColumn<T>[]) {
  const prefs = useColumnPreferences(tableId, columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();
  return { prefs, layout, chosen: prefs.chosen, setLayout };
}
export type ListChrome<T> = ReturnType<typeof useListChrome<T>>;

export function sourceSpec(p: ScreenProps, fo: FacetOptions): FacetSpec {
  return {
    key: "source",
    label: "Source",
    kind: "choice",
    value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
    options: fo.options,
    countsUnavailable: fo.countsUnavailable,
    anyLabel: "Every AWS account",
    onChange: (v) => p.url.patch({ source: v }),
  };
}
