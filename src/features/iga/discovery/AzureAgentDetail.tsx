/**
 * One Azure agent of All agents, in Azure's own terms: where Microsoft lists it,
 * the Entra identity it signs in as, its blueprint, Foundry project and
 * subscription, and when AuthSec's scans found it. READ-ONLY, like every
 * sighting; nothing from Kubernetes or code scans (service account, deployment
 * origin, fingerprint) is shown, since none of it applies to an Azure agent.
 *
 * Tabbed like the Entra Agent ID object pages, so the two feel the same: one
 * read, kept in `?view=`, instead of five panels stacked on top of each other.
 */

import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";

import type { DiscoveredAgent } from "@/app/api/discoveryApi";
import type { Connection } from "@/app/api/connectionsApi";
import { cn } from "@/lib/utils";
import { AzureGraphPanel } from "@/features/discovery/cloud/azure/AzureGraphPanel";
import { AzureTerm } from "@/features/discovery/cloud/azure/AzureTerm";
import { HoverExplain } from "@/features/iga/shared/components/HoverExplain";

import { CopyValue, Fact, Facts, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";
import { AzureLastSignIn, AzureReview } from "./SightingParts";
import { azureAgentEntraId, azureAgentOrigin, azureAgentSignals, azureMetaText } from "./model";

const MUTED = "text-(--color-text-muted)";

/** The last segment of an Azure resource ID: a Foundry project's ID ends in its name. */
const lastSegment = (id: string) => id.split("/").filter(Boolean).pop() ?? id;

type View = "overview" | "graph" | "activity";

const TABS: { key: View; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "What Microsoft records about this agent: where it's found, its blueprint, Foundry project and tenant." },
  { key: "graph", label: "Access Graph", hint: "What this agent can reach, and who or what can act as it." },
  { key: "activity", label: "Sign-ins and activity", hint: "Its last sign-in, and when AuthSec's scans found it." },
];

function TabBar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav aria-label="Views" className="flex gap-1 overflow-x-auto border-b border-(--color-border-subtle)">
      {TABS.map((t) => {
        const current = t.key === view;
        return (
          <HoverExplain key={t.key} title={t.label} text={t.hint}>
            <button
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                current
                  ? "border-(--color-primary) text-(--color-text)"
                  : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
              )}
            >
              {t.label}
            </button>
          </HoverExplain>
        );
      })}
    </nav>
  );
}

export function AzureAgentDetail({ agent: a, connection }: { agent: DiscoveredAgent; connection: Connection | undefined }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const view: View = TABS.some((t) => t.key === requested) ? (requested as View) : "overview";
  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    if (v === "overview") next.delete("view");
    else next.set("view", v);
    setParams(next, { replace: true });
  };

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

      <TabBar view={view} onChange={setView} />

      {view === "overview" ? (
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
      ) : view === "graph" ? (
        <Panel title="Access Graph" description="What this agent can reach, and who or what can act as it.">
          {entraId ? (
            <AzureGraphPanel kind="identity" id={entraId} name={a.display_name || entraId} objectId={entraId} />
          ) : (
            <p className={`text-sm ${MUTED}`}>
              Microsoft lists no Entra identity for this agent, so it has no page in the access graph. An agent inferred by AuthSec is drawn once it is
              matched to one.
            </p>
          )}
        </Panel>
      ) : view === "activity" ? (
        <Panel title="Sign-ins and activity" description="From Microsoft Entra sign-in logs and Microsoft 365 usage, and when AuthSec's scans found it.">
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
      ) : null}
    </>
  );
}
