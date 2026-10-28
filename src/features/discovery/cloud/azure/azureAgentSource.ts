/**
 * Where a Microsoft Entra Agent ID object came from, and what to call it.
 *
 * Microsoft Foundry tags what it creates ("projectName:…", "accountName:…",
 * "agentName:…") and gives it a long generated name, so a Foundry object is
 * named here by its agent, or by its project when the project's agents share
 * it. Anything else was made directly in Microsoft Entra by a person or app.
 */

import type { AzureIdentity } from "@/app/api/cloudDiscoveryApi";

/** An agent identity or blueprint opens its own page, keyed by its Entra object id. */
export const agentPageHref = (r: Pick<AzureIdentity, "native_id">) => `/iga/azure/identity/${encodeURIComponent(r.native_id)}`;

export type AgentSource =
  | { kind: "foundry"; project?: string; account?: string; agent?: string }
  | { kind: "entra"; createdBy?: string };

function tagMap(tags: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(tags)) return m;
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const i = t.indexOf(":");
    if (i > 0) m.set(t.slice(0, i), t.slice(i + 1));
  }
  return m;
}

/** "…/microsoft.cognitiveservices/accounts/<account>/projects/<project>": a Foundry project's resource ID. */
const FOUNDRY_PROJECT = /\/microsoft\.cognitiveservices\/accounts\/([^/#]+)\/projects\/([^/#]+)/i;

/**
 * A Foundry project's own managed identity. Agents in older Foundry projects
 * run as it rather than as an agent identity, and Microsoft Entra lists them
 * among agent identities with "Uses agent identity: No" (an "agent using a
 * service principal"). The Foundry resource's identity is not listed.
 */
export function isFoundryProjectIdentity(identity: Pick<AzureIdentity, "attrs" | "kind">): boolean {
  if (identity.kind !== "entra_managed_identity") return false;
  const res = identity.attrs?.["managed_identity_resource"];
  return typeof res === "string" && FOUNDRY_PROJECT.test(res);
}

/** Whether it has its own agent identity object (Microsoft's "Uses agent identity"). */
export const usesAgentIdentity = (identity: Pick<AzureIdentity, "kind">) => identity.kind === "entra_agent_identity";

export function agentSource(identity: Pick<AzureIdentity, "attrs"> & Partial<Pick<AzureIdentity, "kind">>): AgentSource {
  if (identity.kind && isFoundryProjectIdentity(identity as Pick<AzureIdentity, "attrs" | "kind">)) {
    const m = FOUNDRY_PROJECT.exec(String(identity.attrs?.["managed_identity_resource"]))!;
    return { kind: "foundry", account: m[1], project: m[2] };
  }
  const tags = tagMap(identity.attrs?.["tags"]);
  if (tags.has("projectName") || tags.has("accountName")) {
    return { kind: "foundry", project: tags.get("projectName"), account: tags.get("accountName"), agent: tags.get("agentName") };
  }
  const by = (identity.attrs?.["created_by"] as { by?: string } | undefined)?.by;
  return { kind: "entra", createdBy: by || undefined };
}

/** The name a person would use: the Foundry agent or project, else the name Microsoft shows. */
export function agentDisplayName(identity: Pick<AzureIdentity, "attrs" | "name" | "native_id"> & Partial<Pick<AzureIdentity, "kind">>): string {
  const src = agentSource(identity);
  if (src.kind === "foundry") return src.agent || src.project || identity.name || identity.native_id;
  return identity.name || identity.native_id;
}

/**
 * The second line under a name: where it came from.
 *   Foundry agent · <project>            a published Foundry agent's own
 *   Foundry · shared project <noun>      the one a project's agents share
 *   Foundry project · managed identity   an older project's agents, run as the project
 *   Entra · created by <who>             made directly in Microsoft Entra
 */
export function agentOrigin(identity: Pick<AzureIdentity, "attrs"> & Partial<Pick<AzureIdentity, "kind">>, noun: "blueprint" | "identity"): string {
  if (identity.kind && isFoundryProjectIdentity(identity as Pick<AzureIdentity, "attrs" | "kind">)) return "Foundry project · managed identity";
  const src = agentSource(identity);
  if (src.kind === "foundry") {
    if (src.agent) return src.project ? `Foundry agent · ${src.project}` : "Foundry agent";
    return `Foundry · shared project ${noun}`;
  }
  return src.createdBy ? `Entra · created by ${src.createdBy}` : "Entra";
}

/** Whether an agent identity or blueprint matches a search: its names, origin, object ID, sponsors or owners. */
export function agentMatches(identity: AzureIdentity, needle: string): boolean {
  const s = needle.trim().toLowerCase();
  if (!s) return true;
  const people = (["sponsors", "owners"] as const).flatMap((k) => {
    const v = identity.attrs?.[k];
    return Array.isArray(v) ? v.map((p) => String((p as { name?: string })?.name ?? "")) : [];
  });
  return [identity.name, agentDisplayName(identity), agentOrigin(identity, "identity"), identity.native_id, ...people].some((v) => v.toLowerCase().includes(s));
}
