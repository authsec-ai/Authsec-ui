/**
 * Discovery → Integration detail (Kubernetes agent).
 *
 * Live: the connector row the `iga-agent` self-registers and heartbeats into.
 * `connected` is derived by the backend at read time — we render it, we do not
 * recompute it from a timestamp. Runtime counters (namespaces visible, workloads
 * scanned/matched) come out of the agent's `runtime` snapshot and are shown only
 * when present — never fabricated.
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";

import { ActuationTokenDialog } from "../governance/ActuationTokenDialog";

import { ConsolePage } from "@/components/console/ConsolePage";
import { GitHubRepositoryPanel } from "./GitHubRepositoryPanel";
import { GitHubScanPanel } from "./GitHubScanPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SOURCE_LABELS,
  generateClusterRole,
  collectorConfigFromSource,
  connectorStatusFromSource,
  useListDiscoveredAgentsQuery,
  useGetDiscoverySourceQuery,
} from "@/app/api/discoveryApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

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

export default function IntegrationDetailPage() {
  const { id = "" } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data: source, isLoading: sourceLoading } = useGetDiscoverySourceQuery(id, {
    skip: !id,
  });
  const { data: agentsData } = useListDiscoveredAgentsQuery();
  const [tokenOpen, setTokenOpen] = useState(false);

  const foundHere = useMemo(
    () => (agentsData?.agents ?? []).filter((a) => a.discovery_source_id === id),
    [agentsData, id],
  );

  const status = useMemo(
    () => (source ? connectorStatusFromSource(source) : null),
    [source],
  );
  const config = useMemo(() => collectorConfigFromSource(source), [source]);
  const rbac = useMemo(() => generateClusterRole(config), [config]);

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
  // `repo_scan` is the GitHub channel: no in-cluster agent, an explicit
  // repository scope, and a scan the admin triggers.
  const isGitHub = source.kind === "repo_scan";

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
      {isGitHub ? (
        <div className="space-y-4">
          <GitHubRepositoryPanel sourceId={id} />
          <GitHubScanPanel sourceId={id} />
          {foundHere.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {foundHere.length} agent{foundHere.length === 1 ? "" : "s"} discovered
              through this integration.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => navigate("/iga/agents")}
              >
                Review them
              </button>
            </p>
          )}
        </div>
      ) : !isK8s || !status ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
          {isK8s
            ? "This integration has not been contacted by an agent yet. It will show live status once the iga-agent's first heartbeat lands."
            : "This channel has no in-cluster agent. Only Kubernetes channels deploy an agent; the rest poll a provider API with a stored credential reference."}
        </div>
      ) : (
        <>
          {/* Connector state — `connected` is derived by the backend, not by us. */}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`${PILL} ${
                status.connected
                  ? "bg-(--color-success-soft) text-(--color-success-text)"
                  : "bg-(--color-danger-soft) text-(--color-danger-text)"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {status.connected ? "Connected" : "Disconnected"}
            </span>
            <span className="text-xs text-muted-foreground">
              agent v{status.agentVersion || "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              last heartbeat{" "}
              {status.lastHeartbeatAt
                ? formatDistanceToNow(new Date(status.lastHeartbeatAt), { addSuffix: true })
                : "never"}
            </span>
            {!status.selfRegistered ? (
              <span className="text-xs text-muted-foreground">
                (created by hand — not self-registered by an agent)
              </span>
            ) : null}
          </div>

          {/* Actuation posture: whether quarantine decisions actually enforce here. */}
          <div
            className={`rounded-md border-l-2 px-4 py-3 text-xs ${
              status.actuationEnabledAt
                ? "border-l-(--color-success-text) bg-(--color-success-soft)"
                : "border-l-(--color-warning-text) bg-(--color-warning-soft)"
            }`}
          >
            {status.actuationEnabledAt ? (
              <span className="inline-flex items-center gap-1.5 text-(--color-success-text)">
                <ShieldCheck className="size-3.5" />
                <span>
                  <strong className="font-medium">Enforcement is live.</strong>{" "}
                  <span className="text-foreground/80">
                    Actuation was enabled{" "}
                    {formatDistanceToNow(new Date(status.actuationEnabledAt), { addSuffix: true })}.
                    Quarantine decisions become NetworkPolicies in this cluster.
                  </span>
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-(--color-warning-text)">
                <ShieldAlert className="size-3.5" />
                <span>
                  <strong className="font-medium">Quarantine is advisory here.</strong>{" "}
                  <span className="text-foreground/80">
                    Actuation is not enabled on this connector, so quarantine decisions are
                    recorded but nothing in that cluster enforces them — a quarantined agent keeps
                    full network access. Mint an actuation token and install the agent with the
                    actuation role to change that.
                  </span>
                </span>
              </span>
            )}
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setTokenOpen(true)}
              >
                <KeyRound className="size-3.5" />
                {status.actuationEnabledAt ? "Re-mint actuation token" : "Mint actuation token"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Workloads scanned"
              value={status.workloadsScanned != null ? String(status.workloadsScanned) : "—"}
              hint={status.workloadsScanned == null ? "Not reported yet" : "In visible namespaces"}
            />
            <Stat
              label="Agents matched"
              value={status.workloadsMatched != null ? String(status.workloadsMatched) : "—"}
              hint={`${foundHere.length} in inventory`}
            />
            <Stat
              label="Namespaces visible"
              value={status.namespacesVisible != null ? String(status.namespacesVisible) : "—"}
              hint={status.namespacesVisible == null ? "Not reported yet" : undefined}
            />
            <Stat
              label="Instance"
              value={source.cluster_name || "—"}
              hint={source.instance_id || undefined}
            />
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
                </dl>
                <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                  Detection vocabulary is refreshed from the control plane in place, so keeping the
                  agent current on new frameworks needs no redeploy.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 px-4 py-4">
                <h3 className="text-sm font-semibold">Resync RBAC</h3>
                <p className="text-[11px] text-muted-foreground">
                  Discovery via admission needs no cluster read at all. This read-only role is
                  rendered by the chart only when periodic resync is enabled — no Secrets, no{" "}
                  <span className="font-mono">pods/exec</span>, and no write verb anywhere.
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {rbac}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ActuationTokenDialog
        connectorId={source.id}
        connectorName={source.display_name}
        open={tokenOpen}
        onOpenChange={setTokenOpen}
      />
    </ConsolePage>
  );
}
