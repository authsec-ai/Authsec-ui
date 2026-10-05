/**
 * A connection's coverage, grouped for reading: by region (or the whole
 * account), then by collection surface — each row leading with what the state
 * means for the reader, then what to do. The API name and the raw error are
 * not the lead; they sit behind an expansion on the row.
 */

import type { CloudCoverageState, CloudScanRunGap } from "@/app/api/cloudDiscoveryApi";
import type { StatusTone } from "@/components/ui/status-badge";
import { coverageSeverity } from "@/features/discovery/cloud/aws/awsInventoryLabels";
import { SURFACE_LABEL as GCP_SURFACE_LABEL } from "@/features/discovery/cloud/gcp/gcpConnectorCopy";
import { readableSurface } from "@/features/iga/coverage/surfaceNames";

import type { ConnectionProvider } from "@/app/api/connectionsApi";

export const COVERAGE_TONE: Record<CloudCoverageState, StatusTone> = {
  reached: "success",
  denied: "danger",
  throttled: "warning",
  not_configured: "muted",
  unknown: "muted",
  constrained: "warning",
  stale: "muted",
  partial: "warning",
  not_selected: "muted",
  unsupported: "muted",
};

export const COVERAGE_WORD: Record<CloudCoverageState, string> = {
  reached: "Read",
  denied: "Denied",
  throttled: "Throttled",
  not_configured: "Not configured",
  unknown: "Not checked",
  constrained: "Blocked by policy",
  stale: "Not reconfirmed",
  partial: "Partly read",
  not_selected: "Not selected",
  unsupported: "Not supported",
};

export interface RawSurface {
  state: string;
  count: number;
  error?: string;
}

export interface CoverageRow {
  key: string;
  service: string;
  region: string | null;
  state: CloudCoverageState;
  /** How many were found. Absent where a count is meaningless (a cluster's whole sweep). */
  count?: number;
  error?: string;
  api?: string | null;
  errorCode?: string | null;
  lead: string;
  todo?: string;
}

export interface CoverageGroupView {
  id: string;
  title: string;
  rows: CoverageRow[];
}

const KNOWN = new Set<string>(Object.keys(COVERAGE_WORD));
function stateOf(s: string | undefined): CloudCoverageState {
  return (s && KNOWN.has(s) ? s : "unknown") as CloudCoverageState;
}

function actor(provider: ConnectionProvider): string {
  return provider === "gcp" ? "the reader" : provider === "aws" ? "the discovery role" : "the agent";
}

/** The consequence and the next step for one surface in one state. */
export function consequence(
  provider: ConnectionProvider,
  service: string,
  region: string | null,
  state: CloudCoverageState,
  count: number,
): { lead: string; todo?: string } {
  switch (state) {
    case "reached":
      return { lead: `Read — ${count} found.` };
    case "denied":
      return {
        lead: `Denied — ${actor(provider)} is not allowed to read ${service}. Results from earlier scans are kept and not reconfirmed.`,
        todo:
          provider === "gcp"
            ? "Grant the missing permission to the reader, then verify and scan again."
            : "Grant the permission to the discovery role (the call is under Details). If the stack's template is outdated, update it. Then scan again.",
      };
    case "throttled":
      return { lead: `Throttled — the provider rate-limited this read, so ${service} may be incomplete.`, todo: "Scan again later." };
    case "partial":
      return { lead: `Partly read — only some ${service} were read, so the count is a floor.`, todo: "Scan again. If it keeps happening, the details say why." };
    case "constrained":
      return {
        lead: "Blocked by policy — a policy refused this read by design.",
        todo: "Whoever owns the policy has to allow AuthSec through it. Granting more roles will not change it.",
      };
    case "unknown":
      return { lead: `Not checked — no scan has looked at ${service} yet.`, todo: "Run a scan." };
    case "stale":
      return { lead: `Not reconfirmed — earlier results for ${service} are kept.`, todo: "Scan again." };
    case "not_selected":
      return {
        lead: `Not selected — ${region ?? "this part"} is outside the scan scope. Earlier results are kept and not reconfirmed.`,
        todo: provider === "aws" && region ? "Add the region under Scope to include it." : undefined,
      };
    case "not_configured":
      return { lead: `Not configured — ${service} is not set up for this connection.` };
    default:
      return { lead: `Not supported — AuthSec does not collect ${service} yet.` };
  }
}

/**
 * A Kubernetes cluster's coverage. The agent reports one thing: whether its
 * latest sweep read the whole cluster (`namespaced_only`, `incomplete`). That
 * is not a collection surface, and a cluster cannot be scanned from the
 * console, so these rows say what the gap means and that the agent's next
 * sweep is what updates it. The sentences are the backend's own
 * (internal/k8sread: Affects and the sweep limitation).
 */
export function k8sCoverageRows(gaps: { surface: string; state: string }[]): CoverageRow[] {
  const next = "A cluster is not scanned from here; the agent's next sweep updates this.";
  return gaps.map((g) => {
    const base = { key: g.surface, region: null, state: "partial" as CloudCoverageState };
    switch (g.state) {
      case "namespaced_only":
        return {
          ...base,
          service: "Cluster-scoped objects",
          lead: "Namespaces only — the latest sweep could not read cluster-scoped objects. ClusterRoles and ClusterRoleBindings are not covered, which is where cluster-wide access is granted, so the absence of one proves nothing.",
          todo: next,
        };
      case "incomplete":
        return {
          ...base,
          service: "Cluster sweep",
          lead: "Sweep incomplete — a list failed during the latest sweep, so anything missing from this cluster's inventory may simply not have been read. Nothing was retired.",
          todo: next,
        };
      default:
        return {
          ...base,
          service: "Cluster sweep",
          lead: `The agent reported "${g.state.replace(/_/g, " ")}" for its latest sweep, which this console does not describe yet. Treat the cluster as not fully read.`,
          todo: next,
        };
    }
  });
}

export function buildCoverage(
  provider: ConnectionProvider,
  surfaces: Record<string, RawSurface> | undefined,
  gaps: CloudScanRunGap[] | undefined,
): { groups: CoverageGroupView[]; notSelected: CoverageRow[] } {
  const gapByKey = new Map((gaps ?? []).map((g) => [g.surface, g]));
  const rows: CoverageRow[] = Object.entries(surfaces ?? {}).map(([key, s]) => {
    const state = stateOf(s?.state);
    const parsed = provider === "gcp" ? { service: GCP_SURFACE_LABEL[key] ?? key.replace(/[_-]/g, " "), region: null } : readableSurface(key);
    const gap = gapByKey.get(key);
    const { lead, todo } = consequence(provider, parsed.service, parsed.region, state, s?.count ?? 0);
    return {
      key,
      service: parsed.service,
      region: parsed.region,
      state,
      count: s?.count ?? 0,
      error: s?.error,
      api: gap?.api ?? null,
      errorCode: gap?.error_code ?? null,
      lead,
      todo,
    };
  });

  const notSelected = rows.filter((r) => r.state === "not_selected");
  const rest = rows.filter((r) => r.state !== "not_selected");
  const byRegion = new Map<string, CoverageRow[]>();
  for (const r of rest) {
    const id = r.region ?? "";
    byRegion.set(id, [...(byRegion.get(id) ?? []), r]);
  }
  const groups: CoverageGroupView[] = [...byRegion.entries()]
    .map(([id, rs]) => ({
      id: id || "global",
      title: id ? id : provider === "gcp" ? "Whole project" : "Account-wide",
      rows: [...rs].sort((a, b) => coverageSeverity(b.state) - coverageSeverity(a.state) || a.service.localeCompare(b.service)),
    }))
    // Account-wide first, then the regions; a group with a gap before one without.
    .sort((a, b) => (a.id === "global" ? -1 : b.id === "global" ? 1 : a.id.localeCompare(b.id)));
  return { groups, notSelected };
}
