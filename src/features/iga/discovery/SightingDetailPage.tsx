/**
 * One sighting — `/iga/sightings/:id`. READ-ONLY: facts, the lifecycle trail,
 * the evidence it was found in, and the raw record collapsed. Nothing here
 * claims, provisions, quarantines, releases or deletes, and no enforcement
 * status is shown (SPEC-console-revamp.md *Sightings actions*).
 *
 * The two axes stay apart: what a person DECIDED (status) and what was
 * OBSERVED (runtime). A declared finding says it was declared — a workflow
 * file may never have run.
 */

import { formatDistanceToNow } from "date-fns";
import { Link, useParams } from "react-router-dom";

import { ARCHETYPE_LABELS, ORIGIN_LABELS, SOURCE_LABELS, evidenceModeOf, useGetDiscoveredAgentQuery } from "@/app/api/discoveryApi";
import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { loadFailureOf } from "@/components/console/load-failure";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { AgentLifecycleTrail } from "@/features/discovery/AgentLifecycleTrail";
import { GitHubEvidenceSection } from "@/features/discovery/GitHubEvidenceSection";

import { CopyValue, Fact, Facts, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";
import { FailurePanel } from "./ListStates";
import { SightingEvidence, SightingRuntime, SightingStatus } from "./SightingParts";
import { useClientsLookup } from "./useClientsLookup";
import { discoveryListHref, typeCrumbLabel } from "./urlState";

const MUTED = "text-(--color-text-muted)";

function ago(iso?: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "not known";
}

export default function SightingDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const q = useGetDiscoveredAgentQuery(id, { skip: !id });
  const connections = useListDiscoveryConnectionsQuery();
  const clients = useClientsLookup();
  const a = q.data;
  const back = discoveryListHref("sightings");
  const name = a?.display_name || "Sighting";
  useBreadcrumbTail(a ? `/iga/sightings/${id}` : null, name, { label: typeCrumbLabel("sightings"), href: back });

  const failure = loadFailureOf(q.error);
  const shell = (children: React.ReactNode, description?: React.ReactNode) => (
    <ConsolePage title={name} description={description} variant="object">
      {children}
    </ConsolePage>
  );

  if (q.isLoading) return shell(<div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />);
  if (failure === "not_found") {
    return shell(
      <TableCard>
        <CardContent>
          <p className="text-sm font-semibold text-(--color-text)">Not found in this workspace</p>
          <p className="mt-1 text-xs text-(--color-text-muted)">The link may be from another workspace, or the sighting was removed.</p>
        </CardContent>
      </TableCard>,
    );
  }
  if (failure || !a) {
    return shell(
      <TableCard>
        <CardContent variant="flush">
          <FailurePanel failure={failure === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }} subject="this sighting" permission="discovery:read" onRetry={() => void q.refetch()} />
        </CardContent>
      </TableCard>,
    );
  }

  const mode = evidenceModeOf(a);
  const connection = connections.data?.find((c) => c.id === a.discovery_source_id);
  const client = a.matched_client_id ? clients.client(a.matched_client_id) : undefined;
  const matched = a.matched_client_id ? (
    client ? (
      <span>
        <Link to={`/applications/${encodeURIComponent(client.resource_server_id)}`} className="font-medium hover:underline">
          {client.client_name || client.client_id}
        </Link>
        <span className={MUTED}> · in {client.resource_server_name || "an application"}</span>
      </span>
    ) : clients.ready ? (
      <span className={MUTED}>Matched to an identity this workspace does not list</span>
    ) : (
      <span className={MUTED}>…</span>
    )
  ) : (
    <span className={MUTED}>Unmatched</span>
  );
  const matchedOn = Array.isArray(a.metadata?.matched_on) ? (a.metadata.matched_on as unknown[]).map(String) : [];

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SightingStatus status={a.status} />
        <SightingRuntime runtime={a.runtime_status} />
        <SightingEvidence agent={a} />
      </div>

      <Panel title="Sighting" description="Where this was found and what it is matched to.">
        <Facts>
          <Fact label="Found by">{SOURCE_LABELS[a.source]}</Fact>
          <Fact label="Source">
            {connection ? (
              <Link to={`/iga/connections/${encodeURIComponent(connection.id)}`} className="hover:underline">
                {connection.name || connection.native_id}
              </Link>
            ) : (
              <span className={MUTED}>{a.discovery_source_id ? "A connection this workspace no longer lists" : "Not recorded"}</span>
            )}
          </Fact>
          <Fact label="Matched identity">{matched}</Fact>
          <Fact label="Runs as">{a.observed_service_account || <span className={MUTED}>Not observed</span>}</Fact>
          <Fact label="Identity verified">{a.identity_verified_at ? ago(a.identity_verified_at) : <span className={MUTED}>Not verified</span>}</Fact>
          <Fact label="Origin">
            {mode === "declared" && a.deployment_origin === "unknown" ? (
              <span className={MUTED}>Not established — a declaration does not say how it was deployed</span>
            ) : (
              ORIGIN_LABELS[a.deployment_origin]
            )}
          </Fact>
          <Fact label="Authority source">{ARCHETYPE_LABELS[a.archetype]}</Fact>
          <Fact label="Fingerprint">
            <CopyValue value={a.fingerprint} what="Fingerprint" />
          </Fact>
        </Facts>
      </Panel>

      <Panel title="Runtime" description={mode === "declared" ? "A declaration is not an observation: the agent may never have run." : "What was last observed."}>
        <Facts>
          <Fact label="Observed state">{a.runtime_status === "unknown" ? <span className={MUTED}>Unknown</span> : <SightingRuntime runtime={a.runtime_status} />}</Fact>
          <Fact label="Observed">{a.runtime_observed_at ? ago(a.runtime_observed_at) : <span className={MUTED}>Not observed</span>}</Fact>
          {a.runtime_reason ? <Fact label="Reason">{a.runtime_reason}</Fact> : null}
          {a.terminated_at ? (
            <Fact label="Terminated">
              {ago(a.terminated_at)}
              {a.terminated_by ? ` by ${a.terminated_by}` : ""}
            </Fact>
          ) : null}
          <Fact label={mode === "declared" ? "Scans" : "Sightings"}>{a.sighting_count}</Fact>
          <Fact label={mode === "declared" ? "Last confirmed present" : "Last seen"}>
            <Timestamp iso={a.last_seen_at} />
          </Fact>
          <Fact label="First seen">
            <Timestamp iso={a.first_seen_at} />
          </Fact>
        </Facts>
      </Panel>

      {mode === "declared" ? (
        <Panel title="Evidence" description="Where it was declared. File contents are never stored — only a hash.">
          <div className="space-y-6">
            <GitHubEvidenceSection agent={a} />
          </div>
        </Panel>
      ) : null}

      {matchedOn.length ? (
        <Panel title="Why this was flagged">
          <ul className="list-inside list-disc space-y-1 text-xs text-(--color-text-muted)">
            {matchedOn.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Lifecycle trail" description="How it was noticed, and who removed it when it went.">
        <AgentLifecycleTrail agentId={a.id} />
      </Panel>

      <Panel title="Source metadata">
        <details>
          <summary className="cursor-pointer text-xs font-medium text-(--color-primary-text) hover:underline">Show the raw record</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-(--color-surface-subtle) p-3 text-[11px] leading-relaxed">{JSON.stringify(a.metadata, null, 2)}</pre>
        </details>
      </Panel>
    </>,
    `${SOURCE_LABELS[a.source]} · first seen ${ago(a.first_seen_at)}`,
  );
}
