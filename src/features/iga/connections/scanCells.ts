/** Small, pure pieces of a scan run's display, shared by the Scans table and Recent scans. */

import type { CloudScanRunHistoryItem } from "@/app/api/cloudDiscoveryApi";
import { graphOutcome } from "@/features/discovery/cloud/aws/awsScanRunLabels";
import { safeErrorProse } from "@/features/discovery/cloud/cloudConnectorErrorCopy";

/** The graph cell: the revision once built, else what the graph build is doing — never a bare dash for a build in flight or failed. */
export function graphCell(r: CloudScanRunHistoryItem): { text: string; title?: string } {
  const p = r.projection;
  const title = graphOutcome(r) ?? undefined;
  if (r.status !== "published" || !p) return { text: "—" };
  switch (p.status) {
    case "complete":
      return { text: p.rev != null ? `rev ${p.rev}` : "Added", title };
    case "queued":
      return { text: "Waiting to build", title };
    case "running":
      return { text: "Building…", title };
    case "failed":
      return { text: p.retrying ? "Failed, retrying" : "Failed · previous kept", title: title ? safeErrorProse(title) : undefined };
    case "abandoned":
      return { text: "Abandoned · previous kept", title };
    default:
      return { text: "—" };
  }
}
