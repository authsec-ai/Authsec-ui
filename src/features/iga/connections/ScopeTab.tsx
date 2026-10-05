/**
 * Scope: what this connection reads. AWS regions and GitHub repositories can be
 * changed here (administrators only; the server enforces it); a Kubernetes
 * agent's namespaces are the agent's own configuration, so they are shown
 * read-only with how to change them; a Google Cloud connection's scope is fixed
 * when it is connected.
 */

import { useState } from "react";

import type { Connection } from "@/app/api/connectionsApi";
import { useGetAwsConnectorQuery, useGetGcpConnectorQuery } from "@/app/api/cloudDiscoveryApi";
import { collectorConfigFromSource } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { Button } from "@/components/ui/button";
import { GitHubRepositoryPanel } from "@/features/discovery/GitHubRepositoryPanel";
import { AWSRegionEditor } from "@/features/discovery/cloud/aws/AWSRegionEditor";
import { CopyValue, Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import type { ActionSet } from "./connectionModel";
import { awsAttrs, gcpScopeRows, useSourceFacts } from "./providerData";

function AwsScope({ c, actions, startEditing }: { c: Connection; actions: ActionSet; startEditing: boolean }) {
  const q = useGetAwsConnectorQuery(c.id);
  const [editing, setEditing] = useState(startEditing && actions.editScope);
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this account's regions" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  const regions = awsAttrs(q.data)?.regions ?? [];
  return (
    <Panel
      title="Regions"
      description="The AWS regions whose workloads are scanned. IAM identities, policies and resources are account-wide."
      actions={
        actions.editScope && !editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!q.data}>
            Edit regions
          </Button>
        ) : undefined
      }
    >
      {!q.data ? (
        <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading regions" />
      ) : editing ? (
        <AWSRegionEditor connectorId={c.id} onDone={() => setEditing(false)} />
      ) : (
        <Facts>
          <Fact label="Scanned">{regions.length ? <span className="font-mono text-xs">{regions.join(", ")}</span> : "No regions recorded"}</Fact>
        </Facts>
      )}
      {!actions.editScope && !editing ? <Meta className="mt-3">An administrator can change the regions.</Meta> : null}
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

export function ScopeTab({ c, actions, startEditing }: { c: Connection; actions: ActionSet; startEditing: boolean }) {
  switch (c.provider) {
    case "aws":
      return <AwsScope c={c} actions={actions} startEditing={startEditing} />;
    case "gcp":
      return <GcpScope c={c} />;
    case "k8s":
      return <K8sScope c={c} />;
    default:
      return <GitHubScope c={c} actions={actions} />;
  }
}
