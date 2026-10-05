/**
 * The facts each provider contributes to a connection's Overview, Coverage and
 * Scope — what the retired AWS and Google Cloud drawers and the Kubernetes
 * integration page showed, now on the connection's own page. Each panel reads
 * its provider's own endpoint; none of it is invented from the B3 summary.
 */

import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle } from "lucide-react";

import type { Connection } from "@/app/api/connectionsApi";
import { useGetAwsConnectorQuery, useGetGcpConnectorQuery } from "@/app/api/cloudDiscoveryApi";
import { connectorStatusFromSource, type DiscoverySource } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import {
  TEMPLATE_VERSION_WITH_COMPUTE,
  stackPredatesCompute,
} from "@/features/discovery/cloud/aws/awsInventoryLabels";
import {
  AUTH_METHOD_LABEL,
  LIMIT_COPY,
  ONBOARDING_PATH_LABEL,
  READINESS_LABEL,
  READINESS_TONE,
  readinessReason,
} from "@/features/discovery/cloud/gcp/gcpConnectorCopy";
import { Fact, Facts, Panel, CopyValue } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { awsAttrs, gcpAttrs } from "./providerData";

/** A provider's own read that failed is said as failed, not as missing facts. */
function FactsFailure({ error, subject, onRetry }: { error: unknown; subject: string; onRetry: () => void }) {
  return (
    <LoadFailurePanel
      failure={loadFailureOf(error as Parameters<typeof loadFailureOf>[0]) ?? "failed"}
      subject={subject}
      permission="discovery:read"
      onRetry={onRetry}
    />
  );
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`} />
    </Panel>
  );
}

/* ----------------------------------- AWS ----------------------------------- */

export function AwsFacts({ c }: { c: Connection }) {
  const q = useGetAwsConnectorQuery(c.id);
  if (q.isError && !q.data) return <FactsFailure error={q.error} subject="this account's details" onRetry={() => void q.refetch()} />;
  if (!q.data) return <PanelSkeleton title="Account" />;
  const attrs = awsAttrs(q.data);
  const outdated = stackPredatesCompute(attrs?.template_version);
  return (
    <>
      {outdated ? (
        <div className="flex items-start gap-2 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs leading-relaxed text-(--color-warning-text)">
          <AlertTriangle className="mt-px size-3.5 flex-none" aria-hidden />
          <div>
            <strong className="font-medium">This stack predates compute discovery.</strong> The deployed template is{" "}
            {attrs?.template_version}; version {TEMPLATE_VERSION_WITH_COMPUTE} added the Lambda, ECS and EC2 reads. Until this
            account&rsquo;s CloudFormation stack is updated in AWS, compute stays empty for it — an absence caused by a missing
            permission, not by an account without compute.
          </div>
        </div>
      ) : null}
      <Panel title="Account">
        <Facts>
          <Fact label="Account id" mono>
            {c.native_id}
          </Fact>
          <Fact label="Role ARN">{attrs?.role_arn ? <CopyValue value={attrs.role_arn} what="Role ARN" /> : "—"}</Fact>
          <Fact label="Partition">{attrs?.partition ?? "—"}</Fact>
          <Fact label="Regions scanned">{attrs?.regions?.length ? <span className="font-mono text-xs">{attrs.regions.join(", ")}</span> : "—"}</Fact>
          <Fact label="Template version">
            <span className="inline-flex items-center gap-2">
              {attrs?.template_version ?? "—"}
              {outdated ? (
                <CloudPill tone="warning" dot={false}>
                  Outdated
                </CloudPill>
              ) : null}
            </span>
          </Fact>
          <Fact label="Last verified">
            <Timestamp iso={q.data.verified_at} missing="Never proven" />
          </Fact>
          <Fact label="Caller identity" mono>
            {attrs?.caller_arn ?? "—"}
          </Fact>
        </Facts>
      </Panel>
    </>
  );
}

/* ----------------------------------- GCP ----------------------------------- */

export function GcpFacts({ c }: { c: Connection }) {
  const q = useGetGcpConnectorQuery(c.id);
  if (q.isError && !q.data) return <FactsFailure error={q.error} subject="this project's details" onRetry={() => void q.refetch()} />;
  if (!q.data) return <PanelSkeleton title="Project" />;
  const attrs = gcpAttrs(q.data);
  return (
    <>
      {attrs.write_permissions_held?.length ? (
        <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs text-(--color-danger-text)">
          <strong className="font-medium">This reader holds permissions that can change your project.</strong> It is supposed to hold none:{" "}
          {attrs.write_permissions_held.map((p) => (
            <code key={p} className="mr-1.5">
              {p}
            </code>
          ))}
        </div>
      ) : null}
      <Panel title="Discovery readiness" description="Whether AuthSec can scan this project, from the last permission probe.">
        {attrs.discovery_readiness ? (
          <div className="space-y-2">
            <CloudPill tone={READINESS_TONE[attrs.discovery_readiness] ?? "muted"}>
              {READINESS_LABEL[attrs.discovery_readiness] ?? attrs.discovery_readiness}
            </CloudPill>
            {attrs.discovery_readiness_reasons?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-(--color-text-muted)">
                {attrs.discovery_readiness_reasons.map((r) => (
                  <li key={r}>{readinessReason(r)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-(--color-text-muted)">Every first-phase surface is reachable and the APIs behind them are enabled.</p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-(--color-text-muted)">Not assessed yet. Verify this connection to run the permission probe.</p>
        )}
      </Panel>
      {attrs.capability_limits?.length ? (
        <Panel title="Capability limits" description="Permanent boundaries on this connection, not transient failures.">
          <ul className="space-y-3">
            {attrs.capability_limits.map((limit) => (
              <li key={limit}>
                <p className="text-[13px] font-medium">{LIMIT_COPY[limit]?.label ?? limit}</p>
                <p className="text-xs text-(--color-text-muted)">{LIMIT_COPY[limit]?.body ?? ""}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title="Credential">
        <Facts>
          <Fact label="Onboarded via">{attrs.onboarding_path ? (ONBOARDING_PATH_LABEL[attrs.onboarding_path] ?? attrs.onboarding_path) : "—"}</Fact>
          <Fact label="Authentication">{attrs.auth_method ? (AUTH_METHOD_LABEL[attrs.auth_method] ?? attrs.auth_method) : "—"}</Fact>
          <Fact label="Reader project" mono>
            {attrs.reader_project_id || "—"}
          </Fact>
          {attrs.reader_sa_email ? (
            <Fact label="Reader account">
              <CopyValue value={attrs.reader_sa_email} what="Reader service account" />
            </Fact>
          ) : null}
          <Fact label="Last verified">
            <Timestamp iso={q.data.verified_at} missing="Never proven" />
          </Fact>
        </Facts>
      </Panel>
      {attrs.hints && (attrs.hints.environment || attrs.hints.owning_team || attrs.hints.naming_convention) ? (
        <Panel title="Declared at onboarding">
          <Facts>
            <Fact label="Environment">{attrs.hints.environment || "—"}</Fact>
            <Fact label="Owning team">{attrs.hints.owning_team || "—"}</Fact>
            <Fact label="Contact">{attrs.hints.owner_contact || "—"}</Fact>
            <Fact label="Naming">{attrs.hints.naming_convention || "—"}</Fact>
          </Facts>
        </Panel>
      ) : null}
    </>
  );
}

/* ------------------------------ Kubernetes and GitHub ------------------------------ */

export function K8sFacts({ c, source }: { c: Connection; source: DiscoverySource }) {
  const status = connectorStatusFromSource(source);
  return (
    <Panel title="Cluster and agent" description="The agent reports on its own schedule; AuthSec holds no credential for the cluster.">
      <Facts>
        <Fact label="Cluster">{source.cluster_name || c.native_id}</Fact>
        <Fact label="Agent version">{status.agentVersion ? `v${status.agentVersion}` : "—"}</Fact>
        <Fact label="Last heartbeat">
          {status.lastHeartbeatAt ? (
            <span>
              {formatDistanceToNowStrict(new Date(status.lastHeartbeatAt), { addSuffix: true })}{" "}
              <span className="text-(--color-text-muted)">— connection health, not the inventory date</span>
            </span>
          ) : (
            "Never"
          )}
        </Fact>
        <Fact label="Registration key" mono>
          {source.instance_id || "—"}
        </Fact>
        {source.cluster_uid ? (
          <Fact label="Cluster UID" mono>
            {source.cluster_uid}
          </Fact>
        ) : null}
        <Fact label="Created">{status.selfRegistered ? "Self-registered by the agent" : "Created by hand, not self-registered by an agent"}</Fact>
        <Fact label="Namespaces visible">{status.namespacesVisible ?? "Not reported yet"}</Fact>
        <Fact label="Workloads scanned">{status.workloadsScanned ?? "Not reported yet"}</Fact>
        <Fact label="Agents matched">{status.workloadsMatched ?? "Not reported yet"}</Fact>
      </Facts>
    </Panel>
  );
}

export function GitHubFacts({ c, source }: { c: Connection; source: DiscoverySource }) {
  return (
    <Panel title="Organisation">
      <Facts>
        <Fact label="Organisation" mono>
          {c.native_id}
        </Fact>
        <Fact label="Added">
          <Timestamp iso={c.created_at} />
        </Fact>
        <Fact label="Last scan finished">
          <Timestamp iso={source.last_sync_at} missing="Never" />
        </Fact>
      </Facts>
    </Panel>
  );
}
