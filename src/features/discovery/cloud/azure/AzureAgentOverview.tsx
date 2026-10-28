/**
 * Entra Agent ID overview: every agent identity blueprint with the agent
 * identities made from it beneath it, grouped by who made them (Microsoft
 * Foundry, or someone in Microsoft Entra). The lists on the other views carry
 * the detail; this one answers "what is there, and where did it come from".
 */

import { CornerDownRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useListAzureIdentitiesQuery, AWS_DISCOVERY_MAX_LIMIT, type AzureIdentity } from "@/app/api/cloudDiscoveryApi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { AgentNameCell, AgentStatus } from "./AzureAgentCells";
import { ListFrame, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { AzureTerm } from "./AzureTerm";
import { agentDisplayName, agentMatches, agentPageHref, agentSource, isFoundryProjectIdentity } from "./azureAgentSource";
import { refsOf } from "./azureDiscoveryLabels";

const COLS = 5;

function Group({
  label,
  blueprints,
  agentsOf,
  projectAgents = [],
}: {
  label: string;
  blueprints: AzureIdentity[];
  agentsOf: (b: AzureIdentity) => AzureIdentity[];
  /** Older Foundry projects whose agents run as the project's managed identity: no blueprint. */
  projectAgents?: AzureIdentity[];
}) {
  const navigate = useNavigate();
  if (!blueprints.length && !projectAgents.length) return null;
  const agentCount = blueprints.reduce((n, b) => n + agentsOf(b).length, 0) + projectAgents.length;
  return (
    <>
      <TableRow className="bg-(--color-surface-subtle) hover:bg-(--color-surface-subtle)">
        <TableCell colSpan={COLS} className="py-2 text-xs font-semibold text-(--color-text)">
          {label}
          <span className="ml-2 font-normal text-(--color-text-muted)">
            {blueprints.length} {blueprints.length === 1 ? "blueprint" : "blueprints"} · {agentCount} {agentCount === 1 ? "agent identity" : "agent identities"}
          </span>
        </TableCell>
      </TableRow>
      {blueprints.map((b) => {
        const agents = agentsOf(b);
        return [
          <TableRow key={b.id} onClick={() => navigate(agentPageHref(b))}>
            <TableCell className="max-w-[420px]">
              <AgentNameCell identity={b} noun="blueprint" />
            </TableCell>
            <TableCell className="text-xs text-(--color-text-muted)">Blueprint</TableCell>
            <TableCell>
              <RefNames refs={refsOf(b.attrs, "sponsors")} />
            </TableCell>
            <TableCell>
              <RelativeDate iso={b.created_at} />
            </TableCell>
            <TableCell>
              <AgentStatus enabled={b.enabled} />
            </TableCell>
          </TableRow>,
          ...agents.map((a) => (
            <TableRow key={a.id} onClick={() => navigate(agentPageHref(a))}>
              <TableCell className="max-w-[420px]">
                <div className="flex items-center gap-2 pl-4">
                  <CornerDownRight className="size-3.5 shrink-0 text-(--color-text-muted)" aria-hidden="true" />
                  <AgentNameCell identity={a} noun="identity" strong={false} />
                </div>
              </TableCell>
              <TableCell className="text-xs text-(--color-text-muted)">Agent identity</TableCell>
              <TableCell>
                <RefNames refs={refsOf(a.attrs, "sponsors")} />
              </TableCell>
              <TableCell>
                <RelativeDate iso={a.created_at} />
              </TableCell>
              <TableCell>
                <AgentStatus enabled={a.enabled} />
              </TableCell>
            </TableRow>
          )),
          ...(agents.length
            ? []
            : [
                <TableRow key={`${b.id}-none`} className="hover:bg-transparent">
                  <TableCell colSpan={COLS} className="py-2 text-xs text-(--color-text-muted)">
                    <span className="pl-4">No agent identities</span>
                  </TableCell>
                </TableRow>,
              ]),
        ];
      })}
      {projectAgents.map((a) => (
        <TableRow key={a.id} onClick={() => navigate(agentPageHref(a))}>
          <TableCell className="max-w-[420px]">
            <AgentNameCell identity={a} noun="identity" />
          </TableCell>
          <TableCell className="text-xs text-(--color-text-muted)">
            <AzureTerm term="Uses agent identity">Agent · no blueprint</AzureTerm>
          </TableCell>
          <TableCell>
            <RefNames refs={refsOf(a.attrs, "sponsors")} />
          </TableCell>
          <TableCell>{a.created_at ? <RelativeDate iso={a.created_at} /> : <span className="text-xs text-(--color-text-muted)">—</span>}</TableCell>
          <TableCell>
            <AgentStatus enabled={a.enabled} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function AzureAgentOverview({ connectorId, search = "" }: { connectorId: string | undefined; search?: string }) {
  const scope = { connector_id: connectorId, limit: AWS_DISCOVERY_MAX_LIMIT };
  const agentsQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_agent_identity" });
  const blueprintsQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_application", agent_type: "agent_identity_blueprint" });
  const managedQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_managed_identity" });
  const agents = agentsQ.data?.rows ?? [];
  const projectAgents = (managedQ.data?.rows ?? []).filter(isFoundryProjectIdentity).sort((a, b) => agentDisplayName(a).localeCompare(agentDisplayName(b)));
  const blueprints = [...(blueprintsQ.data?.rows ?? [])].sort((a, b) => agentDisplayName(a).localeCompare(agentDisplayName(b)));
  const allOf = (b: AzureIdentity) => agents.filter((a) => a.attrs?.["agent_blueprint_id"] === b.native_id);
  // Search keeps a blueprint when it or one of its agents matches; a matching blueprint keeps all its agents.
  const q = search.trim();
  const agentsOf = (b: AzureIdentity) => (!q || agentMatches(b, q) ? allOf(b) : allOf(b).filter((a) => agentMatches(a, q)));
  const shownBlueprints = blueprints.filter((b) => !q || agentMatches(b, q) || allOf(b).some((a) => agentMatches(a, q)));
  const shownProjectAgents = projectAgents.filter((a) => agentMatches(a, q));
  const orphans = agents.filter((a) => !blueprints.some((b) => b.native_id === a.attrs?.["agent_blueprint_id"]) && agentMatches(a, q));
  const nothing = !!q && !shownBlueprints.length && !shownProjectAgents.length && !orphans.length;

  return (
    <ListFrame
      loading={agentsQ.isLoading || blueprintsQ.isLoading || managedQ.isLoading}
      failed={(agentsQ.isError || blueprintsQ.isError) && !agents.length && !blueprints.length}
      error={agentsQ.error ?? blueprintsQ.error}
      onRetry={() => {
        void agentsQ.refetch();
        void blueprintsQ.refetch();
      }}
      empty={!agents.length && !blueprints.length}
      noMatch={false}
      emptyText="No agent identities or blueprints found in this tenant."
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>
              <AzureTerm term="Sponsors" />
            </TableHead>
            <TableHead>Created</TableHead>
            <TableHead>
              <AzureTerm term="Status" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <Group label="Microsoft Foundry" blueprints={shownBlueprints.filter((b) => agentSource(b).kind === "foundry")} agentsOf={agentsOf} projectAgents={shownProjectAgents} />
          <Group label="Microsoft Entra" blueprints={shownBlueprints.filter((b) => agentSource(b).kind === "entra")} agentsOf={agentsOf} />
          {nothing ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLS} className="py-8 text-center text-sm text-(--color-text-muted)">
                Nothing matches "{q}".
              </TableCell>
            </TableRow>
          ) : null}
          {orphans.length ? (
            <>
              <TableRow className="bg-(--color-surface-subtle) hover:bg-(--color-surface-subtle)">
                <TableCell colSpan={COLS} className="py-2 text-xs font-semibold text-(--color-text)">
                  Blueprint not found
                </TableCell>
              </TableRow>
              {orphans.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-[420px]">
                    <AgentNameCell identity={a} noun="identity" />
                  </TableCell>
                  <TableCell className="text-xs text-(--color-text-muted)">Agent identity</TableCell>
                  <TableCell>
                    <RefNames refs={refsOf(a.attrs, "sponsors")} />
                  </TableCell>
                  <TableCell>
                    <RelativeDate iso={a.created_at} />
                  </TableCell>
                  <TableCell>
                    <AgentStatus enabled={a.enabled} />
                  </TableCell>
                </TableRow>
              ))}
            </>
          ) : null}
        </TableBody>
      </Table>
    </ListFrame>
  );
}
