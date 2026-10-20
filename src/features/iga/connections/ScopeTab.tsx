/**
 * Scope: what this connection reads. AWS regions and GitHub repositories can be
 * changed here (administrators only; the server enforces it); a Kubernetes
 * agent's namespaces are the agent's own configuration, so they are shown
 * read-only with how to change them; a Google Cloud connection's scope is fixed
 * when it is connected.
 */


import type { Connection } from "@/app/api/connectionsApi";
import { useGetAwsConnectorQuery, useGetGcpConnectorQuery } from "@/app/api/cloudDiscoveryApi";
import { collectorConfigFromSource } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { GitHubRepositoryPanel } from "@/features/discovery/GitHubRepositoryPanel";
import { AWSRegionEditor } from "@/features/discovery/cloud/aws/AWSRegionEditor";
import { CopyValue, Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import type { ActionSet } from "./connectionModel";
import { awsAttrs, gcpScopeRows, useSourceFacts } from "./providerData";

function AwsScope({ c, actions, onScan }: { c: Connection; actions: ActionSet; onScan?: () => Promise<boolean> }) {
  const q = useGetAwsConnectorQuery(c.id);
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this account's regions" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  const regions = awsAttrs(q.data)?.regions ?? [];
  return (
    <Panel
      title="Regions to scan"
      description="Workloads are regional. IAM is always read account-wide."
    >
      {!q.data ? (
        <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading regions" />
      ) : actions.editScope ? (
        // The checklist is the view (2026-10-06 design): nothing to open first.
        <AWSRegionEditor inline connectorId={c.id} current={regions} onDone={() => undefined} // No scan to request while one is queued or running: the save applies to the next one.
          onSaved={actions.scan && c.scan.state !== "queued" && c.scan.state !== "running" ? onScan : undefined}
        />
      ) : (
        <Facts>
          <Fact label="Scanned">{regions.length ? <span className="font-mono text-xs">{regions.join(", ")}</span> : "No regions recorded"}</Fact>
        </Facts>
      )}
      {!actions.editScope ? <Meta className="mt-3">An administrator can change the regions.</Meta> : null}
    </Panel>
  );
}

function GcpScope({ c }: { c: Connection }) {
  const q = useGetGcpConnectorQuery(c.id);
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this project's scope" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading scope" />;
  return (
    <Panel title="Scope" description="Fixed when the project was connected. To scan another project, connect it as its own connection.">
      <Facts>
        {gcpScopeRows(q.data).map((r) => (
          <Fact key={r.label} label={r.label} mono={r.label !== "Enumerable below"}>
            {r.value}
          </Fact>
        ))}
      </Facts>
    </Panel>
  );
}

function K8sScope({ c }: { c: Connection }) {
  const source = useSourceFacts(c);
  const config = source.data ? collectorConfigFromSource(source.data) : null;
  const snippet = `helm upgrade authsec-iga-agent <chart> --reuse-values \\\n  --set "webhook.includedNamespaces=ns-one ns-two"`;
  return (
    <div className="space-y-4">
      <Panel title="Namespaces" description="The agent decides what it reads; this page cannot change it.">
        <Facts>
          <Fact label="Reported scope">{c.scope_summary || "Not reported yet"}</Fact>
          {config ? (
            <Fact label="Recorded when added">
              <span className="font-mono text-xs">
                {config.namespaceMode === "all" ? "all namespaces" : `${config.namespaceMode}: ${config.namespaces.join(", ") || "none"}`}
              </span>
            </Fact>
          ) : null}
        </Facts>
        {source.isError && !source.data ? (
          <Meta className="mt-2">
            The recorded configuration could not be loaded.{" "}
            <button className="underline" onClick={() => void source.refetch()}>
              Retry
            </button>
          </Meta>
        ) : null}
      </Panel>
      <Panel title="How to change it" description="Namespaces are set in the agent's Helm values and applied by upgrading the release.">
        <Meta>
          Use <span className="font-mono">webhook.includedNamespaces</span> to scan only the namespaces you list, or{" "}
          <span className="font-mono">webhook.excludedNamespaces</span> to scan all but the ones you list.
        </Meta>
        <div className="mt-2 rounded-md bg-(--color-surface-subtle) p-2.5">
          <CopyValue value={snippet} what="Helm command" />
        </div>
      </Panel>
    </div>
  );
}

function GitHubScope({ c, actions }: { c: Connection; actions: ActionSet }) {
  if (!actions.editScope) {
    return (
      <Panel title="Repositories" description="The repositories a scan reads.">
        <Facts>
          <Fact label="In scope">{c.scope_summary || "None selected"}</Fact>
        </Facts>
        <Meta className="mt-3">An administrator can change the repositories.</Meta>
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <Meta>
        Applies from the next scan. Sightings already found in a repository you deselect are kept; later scans do not update them.
      </Meta>
      <GitHubRepositoryPanel sourceId={c.id} />
    </div>
  );
}

export function ScopeTab({ c, actions, onScan }: { c: Connection; actions: ActionSet; onScan?: () => Promise<boolean> }) {
  switch (c.provider) {
    case "aws":
      return <AwsScope c={c} actions={actions} onScan={onScan} />;
    case "gcp":
      return <GcpScope c={c} />;
    case "k8s":
      return <K8sScope c={c} />;
    default:
      return <GitHubScope c={c} actions={actions} />;
  }
}
