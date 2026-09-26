/**
 * Workload › Runtime instances. A live row has no end and a null TTL basis.
 * An ended row names `runtime_unobserved` as the basis for its TTL.
 */

import { useState } from "react";

import {
  useGetWorkloadRuntimeInstancesQuery,
  useGetWorkloadRuntimePolicyStatusQuery,
  type RuntimeInstanceRow,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { CursorPager } from "../shared/components/CursorPager";
import { Panel } from "../shared/components/Panel";
import { useGraphRevision } from "../shared/revision";
import { RuntimePolicyCard } from "./RuntimePolicyCard";

function basisLabel(row: RuntimeInstanceRow): string {
  if (row.ended_at) return row.ttl_basis ?? "Unknown";
  return row.ttl_basis ?? "Live";
}

export function RuntimeInstancesView({ rows }: { rows: RuntimeInstanceRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-(--color-text-muted)">No runtime instances were returned for this workload.</p>;
  }
  return (
    <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)" aria-label="Runtime instances">
      {rows.map((row) => {
        const live = !row.ended_at;
        return (
          <li key={row.ref} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-(--color-text)">{row.runtime_key}</span>
              <span className="block text-xs text-(--color-text-muted)">{row.runtime_kind}</span>
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge tone={live ? "info" : "neutral"}>{live ? "Live" : "Ended"}</StatusBadge>
              <span className="text-xs text-(--color-text-muted)">TTL basis: {basisLabel(row)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function WorkloadRuntimeTab({ ws, id }: { ws: string; id: string }) {
  const { rev, epoch } = useGraphRevision(ws);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [stack, setStack] = useState<(string | undefined)[]>([]);
  const instances = useGetWorkloadRuntimeInstancesQuery({ ws, rev, key: String(epoch), id, cursor, graph: "v2" });
  const policy = useGetWorkloadRuntimePolicyStatusQuery({ ws, rev, key: String(epoch), id, graph: "v2" });
  const rows = instances.data?.data ?? [];
  const meta = instances.data?.meta;

  return (
    <div className="space-y-4">
      <RuntimePolicyCard status={policy.data?.data} />
      <Panel title="Runtime instances">
        {instances.isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading runtime instances" />
        ) : (
          <RuntimeInstancesView rows={rows} />
        )}
        {meta ? (
          <CursorPager
            meta={meta}
            pageIndex={stack.length}
            rowsOnPage={rows.length}
            onPrev={() => {
              const prev = stack[stack.length - 1];
              setStack((s) => s.slice(0, -1));
              setCursor(prev);
            }}
            onNext={() => {
              if (!meta.next_cursor) return;
              setStack((s) => [...s, cursor]);
              setCursor(meta.next_cursor);
            }}
          />
        ) : null}
      </Panel>
    </div>
  );
}
