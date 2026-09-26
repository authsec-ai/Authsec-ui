/** Identity › Observed use: runtime bindings and the access observed through them. */

import { useGetIdentityObservedUseQuery } from "@/app/api/igaGraphApi";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { useGraphRevision } from "../shared/revision";

export function IdentityObservedUseTab({ ws, id }: { ws: string; id: string }) {
  const { rev, epoch } = useGraphRevision(ws);
  const q = useGetIdentityObservedUseQuery({ ws, rev, key: String(epoch), id, graph: "v2" });
  const data = q.data?.data;

  if (q.isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading observed use" />;
  }
  if (!data) {
    return <p className="text-sm text-(--color-text-muted)">Observed use was not returned for this identity.</p>;
  }

  return (
    <div className="space-y-4">
      <Panel title="Runtime bindings" count={String(data.bindings.length)}>
        {data.bindings.length === 0 ? (
          <p className="text-sm text-(--color-text-muted)">No runtime binding was returned.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)" aria-label="Observed use">
            {data.bindings.map((binding) => (
              <li key={binding.ref} className="py-2">
                <Facts>
                  <Fact label="Binding kind">{binding.binding_kind}</Fact>
                  <Fact label="Basis">{binding.basis}</Fact>
                  <Fact label="Workload">{String(binding.workload)}</Fact>
                  <Fact label="Runtime instance">{String(binding.runtime_instance)}</Fact>
                </Facts>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
