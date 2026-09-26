/**
 * Runtime policy status. The server answers `not_configured` until a later
 * package sends desired and applied receipts. That answer is never green.
 */

import { useGetWorkloadRuntimePolicyStatusQuery, type RuntimePolicyStatus } from "@/app/api/igaGraphApi";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { useGraphRevision } from "../shared/revision";
import { ProtectionBadge } from "../coverage/ProtectionBadge";

export function RuntimePolicyCard({ status }: { status?: RuntimePolicyStatus | null }) {
  return (
    <Panel title="Runtime policy">
      <Facts>
        <Fact label="Status">
          <ProtectionBadge status={status?.status ?? "not_configured"} />
        </Fact>
      </Facts>
      <p className="mt-2 text-xs text-(--color-text-muted)">
        Desired and applied policy are not reported yet, so this workload is not shown as protected.
      </p>
    </Panel>
  );
}

export function RuntimePolicyStatus({ ws, id }: { ws: string; id: string }) {
  const { rev, epoch } = useGraphRevision(ws);
  const q = useGetWorkloadRuntimePolicyStatusQuery({ ws, rev, key: String(epoch), id, graph: "v2" });
  return <RuntimePolicyCard status={q.data?.data} />;
}
