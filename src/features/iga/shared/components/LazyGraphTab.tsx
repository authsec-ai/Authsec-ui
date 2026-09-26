import { Suspense, lazy } from "react";

import type { GraphRef } from "@/app/api/igaGraphApi";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

/**
 * The Graph tab, fetched only when first opened: React Flow and ELK are a
 * separate chunk, kept out of every other page's bundle (§2.14.15).
 */
const GraphTab = lazy(() => import("../../graph/GraphTab"));

export function LazyGraphTab(props: { ws: string; root: GraphRef; rootName: string; graphV2?: boolean }) {
  return (
    <Suspense
      fallback={
        <TableCard>
          <CardContent>
            <div className="h-96 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the graph" />
          </CardContent>
        </TableCard>
      }
    >
      <GraphTab {...props} />
    </Suspense>
  );
}
