/**
 * One Azure agent of All agents, in Azure's own terms: where Microsoft lists it,
 * the Entra identity it signs in as, its blueprint, Foundry project and
 * subscription, and when AuthSec's scans found it. READ-ONLY, like every
 * sighting; nothing from Kubernetes or code scans (service account, deployment
 * origin, fingerprint) is shown, since none of it applies to an Azure agent.
 */

import { Link } from "react-router-dom";

import type { DiscoveredAgent } from "@/app/api/discoveryApi";
import type { Connection } from "@/app/api/connectionsApi";
import { AgentLifecycleTrail } from "@/features/discovery/AgentLifecycleTrail";
import { AzureTerm } from "@/features/discovery/cloud/azure/AzureTerm";

import { CopyValue, Fact, Facts, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";
import { AzureLastSignIn, AzureReview } from "./SightingParts";
import { azureAgentEntraId, azureAgentOrigin, azureAgentSignals, azureMetaText } from "./model";

const MUTED = "text-(--color-text-muted)";

/** The last segment of an Azure resource ID: a Foundry project's ID ends in its name. */
const lastSegment = (id: string) => id.split("/").filter(Boolean).pop() ?? id;

export function AzureAgentDetail({ agent: a, connection }: { agent: DiscoveredAgent; connection: Connection | undefined }) {
  const tenant = azureMetaText(a, "tenant_id").toLowerCase();
  const entraId = azureAgentEntraId(a);
  const blueprint = azureMetaText(a, "blueprint_name");
  const agentUser = azureMetaText(a, "agent_user");
  const project = azureMetaText(a, "foundry_project_id");
  const subscription = azureMetaText(a, "subscription_id");
  const createdBy = azureMetaText(a, "created_by");
  const registry = ((a.metadata ?? {}) as Record<string, unknown>)["registry"] as Record<string, unknown> | undefined;
  const publisher = typeof registry?.["publisher"] === "string" ? (registry["publisher"] as string) : "";
  const signals = azureAgentSignals(a);
  const scans = `${a.sighting_count} scan${a.sighting_count === 1 ? "" : "s"}`;

  return (
    <>
      {a.status !== "unregistered" ? (
        <div className="flex flex-wrap items-center gap-2">
          <AzureReview status={a.status} />
        </div>
      ) : null}

      <Panel title="In Azure" description="What Microsoft records about this agent, as AuthSec's latest scan read it.">
        <Facts>
          <Fact label={<AzureTerm term="Found in" />}>{azureAgentOrigin(a)}</Fact>
          <Fact label={<AzureTerm term="Tenant" />}>
            {connection ? (
              <span>
                <Link to={`/iga/connections/${encodeURIComponent(connection.id)}`} className="hover:underline">
                  {connection.name || connection.native_id}
                </Link>
                {tenant && (connection.name || connection.native_id).toLowerCase() !== tenant ? <span className={MUTED}> · {tenant}</span> : null}
              </span>
            ) : (
              tenant || <span className={MUTED}>Not recorded</span>
            )}
          </Fact>
          <Fact label={<AzureTerm term="Entra identity" />}>
            {entraId ? <CopyValue value={entraId} what="Object ID" /> : <span className={MUTED}>None recorded: Microsoft lists no Entra identity for it</span>}
          </Fact>
          {blueprint ? <Fact label={<AzureTerm term="Agent identity blueprint" />}>{blueprint}</Fact> : null}
          {agentUser ? <Fact label={<AzureTerm term="Agent user" />}>{agentUser}</Fact> : null}
          {project ? <Fact label={<AzureTerm term="Foundry project" />}>{lastSegment(project)}</Fact> : null}
          {subscription ? (
            <Fact label={<AzureTerm term="Subscription" />}>
              <CopyValue value={subscription} what="Subscription ID" />
            </Fact>
          ) : null}
          {publisher ? <Fact label={<AzureTerm term="Publisher" />}>{publisher}</Fact> : null}
          {createdBy ? <Fact label={<AzureTerm term="Created by" />}>{createdBy}</Fact> : null}
        </Facts>
        {signals.length ? (
          <>
            <p className="mt-4 text-xs font-medium text-(--color-text)">What the scan recorded</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-(--color-text-muted)">
              {signals.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Panel>

      <Panel title="Activity" description="From Microsoft Entra sign-in logs and Microsoft 365 usage, and when AuthSec's scans found it.">
        <Facts>
          <Fact label={<AzureTerm term="Last sign-in" />}>
            <AzureLastSignIn agent={a} />
          </Fact>
          {a.runtime_status === "gone" && a.runtime_reason ? <Fact label="Why">{a.runtime_reason}</Fact> : null}
          <Fact label={<AzureTerm term="Last seen" />}>
            <Timestamp iso={a.last_seen_at} />
            <span className={MUTED}> · found in {scans}</span>
          </Fact>
          <Fact label="First found">
            <Timestamp iso={a.first_seen_at} />
          </Fact>
        </Facts>
      </Panel>

      <Panel title="History" description="When AuthSec found it, and when it stopped being found in Azure.">
        <AgentLifecycleTrail agentId={a.id} />
      </Panel>

      <Panel title="Raw record">
        <details>
          <summary className="cursor-pointer text-xs font-medium text-(--color-primary-text) hover:underline">Show what discovery stored</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-(--color-surface-subtle) p-3 text-[11px] leading-relaxed">{JSON.stringify(a.metadata, null, 2)}</pre>
        </details>
      </Panel>
    </>
  );
}
