/**
 * Discovery → Integration detail (Kubernetes collector).
 *
 * PROTOTYPE. The panel that matters here is Permissions: what the generated
 * RBAC asked for versus what the collector can actually read. A platform team
 * routinely trims a ClusterRole before applying it, and if we don't surface that
 * we would report coverage we do not have.
 */

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ArrowUpCircle } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SOURCE_LABELS,
  generateClusterRole,
  useCollectorConfig,
  useCollectorStatus,
  useListDiscoveredAgentsQuery,
  useGetDiscoverySourceQuery,
  type CollectorState,
  type PermissionGrant,
} from "@/app/api/discoveryApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATE_STYLE: Record<CollectorState, string> = {
  connected: "bg-(--color-success-soft) text-(--color-success-text)",
  awaiting_enrollment: "bg-(--color-warning-soft) text-(--color-warning-text)",
  degraded: "bg-(--color-warning-soft) text-(--color-warning-text)",
  disconnected: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

const STATE_LABEL: Record<CollectorState, string> = {
  connected: "Connected",
  awaiting_enrollment: "Awaiting enrollment",
  degraded: "Degraded",
  disconnected: "Disconnected",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
        {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/** Requested vs granted, per rule. */
function permissionVerdict(p: PermissionGrant): {
  label: string;
  tone: "ok" | "partial" | "missing";
  detail: string;
} {
  if (p.clusterWideRequested && p.clusterWideGranted) {
    return { label: "Full", tone: "ok", detail: "All namespaces" };
  }
  if (p.clusterWideRequested && p.grantedNamespaces.length > 0) {
    return {
      label: "Partial",
      tone: "partial",
      detail: `${p.grantedNamespaces.length} namespace${p.grantedNamespaces.length === 1 ? "" : "s"}: ${p.grantedNamespaces.join(", ")}`,
    };
  }
  if (p.clusterWideRequested && p.grantedNamespaces.length === 0) {
    return { label: "Denied", tone: "missing", detail: "No namespace readable" };
  }
  return { label: "Full", tone: "ok", detail: p.grantedNamespaces.join(", ") || "As requested" };
}

export default function IntegrationDetailPage() {
  const { id = "" } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data: source, isLoading: sourceLoading } = useGetDiscoverySourceQuery(id, {
    skip: !id,
  });
  const { data: agentsData } = useListDiscoveredAgentsQuery();
  // Collector telemetry has no endpoint yet — heartbeat, version and the
  // requested-vs-effective RBAC report are still local fixtures.
  const { data: status } = useCollectorStatus(id);
  const { data: config } = useCollectorConfig(id);

  const foundHere = useMemo(
    () => (agentsData?.agents ?? []).filter((a) => a.discovery_source_id === id),
    [agentsData, id],
  );
  const rbac = useMemo(() => generateClusterRole(config), [config]);

  const missingNamespaces = useMemo(() => {
    if (!status) return [];
    return status.namespacesConfigured.filter((ns) => !status.namespacesVisible.includes(ns));
  }, [status]);

  if (sourceLoading) {
    return <ConsolePage title="Integration" description="Loading…">{null}</ConsolePage>;
  }

  if (!source) {
    return (
      <ConsolePage title="Integration" description="Not found.">
        <Button variant="outline" onClick={() => navigate("/iga/integrations")}>
          <ArrowLeft className="size-4" /> Back to integrations
        </Button>
      </ConsolePage>
    );
  }

  const isK8s = source.kind === "k8s_webhook";

  return (
    <ConsolePage
      title={source.display_name}
      description={`${SOURCE_LABELS[source.kind]} discovery channel.`}
      actions={
        <Button variant="outline" onClick={() => navigate("/iga/integrations")}>
          <ArrowLeft className="size-4" /> All integrations
        </Button>
      }
    >
      {!isK8s || !status ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
          {isK8s
            ? "No collector telemetry yet. The integration is registered; heartbeat, version and effective-permission reporting need the collector's own endpoint, which does not exist yet."
            : "This channel has no in-cluster collector. Only Kubernetes channels deploy an agent; the rest poll a provider API with a stored credential reference."}
        </div>
      ) : (
        <>
          {/* Collector state */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`${PILL} ${STATE_STYLE[status.state]}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {STATE_LABEL[status.state]}
            </span>
            <span className="text-xs text-muted-foreground">
              collector v{status.version ?? "—"}
              {status.version && status.version !== status.latestVersion ? (
                <span className="ml-2 inline-flex items-center gap-1 text-(--color-warning-text)">
                  <ArrowUpCircle className="size-3.5" />
                  v{status.latestVersion} available
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              last heartbeat{" "}
              {status.lastHeartbeatAt
                ? formatDistanceToNow(new Date(status.lastHeartbeatAt), { addSuffix: true })
                : "never"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Workloads scanned"
              value={String(status.workloadsScanned)}
              hint="In visible namespaces"
            />
            <Stat
              label="Agents matched"
              value={String(status.workloadsMatched)}
              hint={`${foundHere.length} in inventory`}
            />
            <Stat
              label="Namespaces visible"
              value={`${status.namespacesVisible.length} of ${status.namespacesConfigured.length}`}
              hint={missingNamespaces.length > 0 ? "Coverage is incomplete" : "Full coverage"}
            />
            <Stat
              label="Resync"
              value={config.watchEnabled ? "Watch + periodic" : "Periodic only"}
              hint={`Every ${config.resyncMinutes} min`}
            />
          </div>

          {/* The panel that matters */}
          <div>
            <h2 className="mb-1 mt-2 text-sm font-semibold">Permissions</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              What the generated RBAC asked for, against what the collector can actually read.
              A trimmed ClusterRole is normal — but it means coverage is partial, and that is
              reported rather than assumed.
            </p>
            <TableCard>
              <CardContent variant="flush">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 font-semibold">Resource</th>
                        <th className="px-4 py-2.5 font-semibold">Verbs</th>
                        <th className="px-4 py-2.5 font-semibold">Requested</th>
                        <th className="px-4 py-2.5 font-semibold">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.permissions.map((p) => {
                        const v = permissionVerdict(p);
                        return (
                          <tr key={p.resource} className="border-b last:border-0">
                            <td className="px-4 py-2.5 font-mono">{p.resource}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">
                              {p.verbs.join(", ")}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {p.clusterWideRequested ? "All namespaces" : p.requestedNamespaces.join(", ")}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`${PILL} ${
                                  v.tone === "ok"
                                    ? "bg-(--color-success-soft) text-(--color-success-text)"
                                    : v.tone === "partial"
                                      ? "bg-(--color-warning-soft) text-(--color-warning-text)"
                                      : "bg-(--color-danger-soft) text-(--color-danger-text)"
                                }`}
                              >
                                {v.label}
                              </span>
                              <div className="mt-1 max-w-[280px] truncate text-[11px] text-muted-foreground" title={v.detail}>
                                {v.detail}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </TableCard>

            {missingNamespaces.length > 0 ? (
              <div className="mt-3 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-4 py-3 text-xs">
                <strong className="font-medium">
                  {missingNamespaces.length} configured namespace
                  {missingNamespaces.length === 1 ? "" : "s"} not readable:
                </strong>{" "}
                <span className="font-mono">{missingNamespaces.join(", ")}</span>. Anything
                running there is invisible to this channel. This is reported as partial
                coverage, never as zero agents.
              </div>
            ) : null}
          </div>

          {/* Config + RBAC */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 px-4 py-4">
                <h3 className="text-sm font-semibold">Scan configuration</h3>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Namespaces</dt>
                    <dd className="text-right font-mono">
                      {config.namespaceMode === "all"
                        ? "all"
                        : `${config.namespaceMode}: ${config.namespaces.join(", ")}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Kinds</dt>
                    <dd className="text-right font-mono">{config.kinds.join(", ")}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Detection rules</dt>
                    <dd className="text-right">
                      {config.detection.labelSelectors.length +
                        config.detection.imagePatterns.length +
                        config.detection.envPatterns.length +
                        config.detection.configPaths.length}{" "}
                      across 4 categories
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Single-signal matches</dt>
                    <dd className="text-right">
                      {config.detection.reportLowConfidence ? "Reported" : "Suppressed"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Heartbeat</dt>
                    <dd className="text-right font-mono">{config.heartbeatSeconds}s</dd>
                  </div>
                </dl>
                <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                  Config is fetched on heartbeat. Editing it applies within{" "}
                  {config.heartbeatSeconds}s — no redeploy, no Helm upgrade.
                </p>
                <Button variant="outline" size="sm" className="text-xs">
                  Edit scan configuration
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 px-4 py-4">
                <h3 className="text-sm font-semibold">Generated RBAC</h3>
                <p className="text-[11px] text-muted-foreground">
                  Read-only by construction: no Secrets, no <span className="font-mono">pods/exec</span>,
                  no <span className="font-mono">pods/log</span>, and no write verb anywhere.
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {rbac}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </ConsolePage>
  );
}
