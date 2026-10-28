/**
 * What Discovery can show, per provider, object type and view
 * (SPEC-console-revamp.md *Supported object types per provider*, *Control
 * contract*, *Filter semantics*). One table of facts, so the type switcher,
 * the filter row, the not-collected state and the filter removal on a switch
 * all answer from the same place.
 */

import { evidenceModeOf, type DiscoveredAgent, type DiscoverySourceKind } from "@/app/api/discoveryApi";

import {
  PROVIDER_LABEL,
  TYPE_LABEL,
  type DiscoveryProvider,
  type DiscoveryType,
  type DiscoveryView,
} from "./urlState";

/** The object types each provider collects today. Anything else is *not collected*. */
export const TYPES_BY_PROVIDER: Record<DiscoveryProvider, DiscoveryType[]> = {
  aws: ["workloads", "identities", "resources"],
  k8s: ["workloads", "identities", "sightings"],
  gcp: ["identities"],
  azure: ["agents", "sightings", "identities", "resources", "workloads"],
  github: ["sightings"],
};

export function supportsType(provider: DiscoveryProvider, type: DiscoveryType): boolean {
  return TYPES_BY_PROVIDER[provider].includes(type);
}

/**
 * What the count beside a type segment follows, said in its tooltip. It is not
 * the same everywhere: Published and Kubernetes counts keep the search, the
 * Latest collected and sightings counts are the source's own totals and do not.
 */
export function countBasis(view: DiscoveryView, type: DiscoveryType): string {
  if (type === "sightings") return "counted for the current source. Search and filters do not change it";
  if (view === "latest") return "counted for the current source. Search does not change it";
  return "counted with the current search and source";
}

/** Why a combination is not collected: one sentence the reader can act on or accept. */
export function notCollectedReason(provider: DiscoveryProvider, type: DiscoveryType): string {
  const what = TYPE_LABEL[type].toLowerCase();
  switch (provider) {
    case "aws":
      return `AuthSec does not collect ${what} from AWS. Agent sightings come from repository scans and cluster webhooks.`;
    case "k8s":
      return `AuthSec does not list ${what} for Kubernetes. A cluster's roles and bindings appear as the access chain of a ServiceAccount.`;
    case "gcp":
      return type === "sightings"
        ? "AuthSec does not collect agent sightings from Google Cloud."
        : `AuthSec collects only service accounts from Google Cloud today, not ${what}.`;
    case "azure":
      return `AuthSec does not collect ${what} from Azure.`;
    case "github":
      return type === "workloads" || type === "identities" || type === "resources"
        ? `GitHub ${what} appear in the inventory only once a GitHub collector records them, and none does yet. GitHub is sightings only today.`
        : `AuthSec does not collect ${what} from GitHub.`;
  }
}

/** Does this provider/type have both a Published and a Latest collected reading? */
export function hasViews(provider: DiscoveryProvider, type: DiscoveryType): boolean {
  return provider === "aws" && type !== "sightings";
}

/** The reading in force: Published by default; Google Cloud has only Latest collected. */
export function effectiveView(provider: DiscoveryProvider, type: DiscoveryType, requested: DiscoveryView | undefined): DiscoveryView {
  if (provider === "gcp") return "latest";
  if (hasViews(provider, type)) return requested ?? "published";
  return "published";
}

/* --------------------------------- filters -------------------------------- */

export type FilterKey =
  | "region"
  | "lifecycle"
  | "classification"
  | "runtime"
  | "runs_as"
  | "kind"
  | "bound"
  | "representation"
  | "external"
  | "service"
  | "namespace"
  | "status"
  | "live"
  | "attribution"
  | "section";

const FILTER_LABEL: Record<FilterKey, string> = {
  region: "Region",
  lifecycle: "Lifecycle",
  classification: "Classification",
  runtime: "Runtime",
  runs_as: "Runs as",
  kind: "Kind",
  bound: "Bound to a workload",
  representation: "Representation",
  external: "External",
  service: "Service",
  namespace: "Namespace",
  status: "Status",
  live: "Live only",
  attribution: "Attribution",
  section: "Section",
};

/** The URL parameters that are not type-specific filters. */
export const NON_FILTER_PARAMS = ["provider", "type", "view", "q", "source", "sel", "sort", "evidence", "via"] as const;

/** Server-side or client-side; the filters each list offers. Source is always offered and is not listed. */
function filterKeysFor(provider: DiscoveryProvider, view: DiscoveryView, type: DiscoveryType): FilterKey[] {
  if (provider === "aws" && view === "published") {
    if (type === "workloads") return ["region", "lifecycle", "classification", "runtime", "runs_as"];
    if (type === "identities") return ["lifecycle", "kind", "bound"];
    if (type === "resources") return ["region", "lifecycle", "representation", "external", "service"];
  }
  if (provider === "aws" && view === "latest") {
    if (type === "workloads") return ["runtime", "attribution", "section"];
    if (type === "identities") return ["kind"];
    if (type === "resources") return ["kind"];
  }
  if (provider === "k8s") {
    if (type === "workloads" || type === "identities") return ["kind", "namespace"];
    if (type === "sightings") return ["status", "live"];
  }
  if (provider === "azure" && (type === "identities" || type === "resources" || type === "workloads")) return ["kind", "lifecycle"];
  if ((provider === "github" || provider === "azure") && type === "sightings") return ["status", "live"];
  return [];
}

/** What survives a switch of type: Source always; Region only where the new type has it. */
const CARRIED_ACROSS_TYPES: readonly FilterKey[] = ["region", "namespace"];

export interface RemovedFilter {
  key: string;
  label: string;
  /** "not a resource filter" — why it could not stay. */
  reason: string;
}

const NOUN: Record<DiscoveryType, string> = {
  agents: "agent",
  workloads: "workload",
  identities: "identity",
  resources: "resource",
  sightings: "sighting",
};

export interface Scope {
  provider: DiscoveryProvider;
  type: DiscoveryType;
  view: DiscoveryView;
}

function prettyValue(v: string): string {
  return v.replace(/_/g, " ");
}

/**
 * The URL for a switch of provider, type or view, and the filters that did not
 * survive it — each named, so a filter is never dropped silently. `q` stays (it
 * is the search box, not a filter). The selection and the sort do not: an
 * object belongs to its list, and sort keys differ per type.
 */
export function planSwitch(current: URLSearchParams, from: Scope, to: Scope): { params: URLSearchParams; removed: RemovedFilter[] } {
  const next = new URLSearchParams();
  next.set("provider", to.provider);
  next.set("type", to.type);
  if (hasViews(to.provider, to.type) && to.view !== "published") next.set("view", to.view);
  const q = current.get("q");
  if (q) next.set("q", q);

  const removed: RemovedFilter[] = [];
  const sameProvider = from.provider === to.provider;
  const sameView = from.view === to.view;
  const allowed = new Set(filterKeysFor(to.provider, to.view, to.type));

  const source = current.get("source");
  if (source) {
    if (sameProvider) next.set("source", source);
    else removed.push({ key: "source", label: "Source", reason: `belongs to ${PROVIDER_LABEL[from.provider]}` });
  }

  const seen = new Set<string>();
  current.forEach((value, key) => {
    if ((NON_FILTER_PARAMS as readonly string[]).includes(key) || !value || seen.has(key)) return;
    seen.add(key);
    const fk = key as FilterKey;
    const label = FILTER_LABEL[fk] ?? key;
    const shown = `${label}${value === "1" || value === "true" ? "" : ` (${prettyValue(value)})`}`;
    if (sameProvider && sameView && CARRIED_ACROSS_TYPES.includes(fk) && allowed.has(fk)) {
      next.set(key, value);
      return;
    }
    let reason: string;
    if (!sameProvider) reason = `belongs to ${PROVIDER_LABEL[from.provider]}`;
    else if (allowed.has(fk)) reason = sameView ? "means something different for each type, so it is reset" : "means something different in each view, so it is reset";
    else if (!sameView) reason = to.view === "latest" ? "not a Latest collected filter" : "not a Published filter";
    else if (from.type !== to.type) reason = `not a ${NOUN[to.type]} filter`;
    else reason = "not available here";
    removed.push({ key, label: shown, reason });
  });
  return { params: next, removed };
}

/** The collector kind each provider's sightings come from. */
export type SightingProvider = "k8s" | "github" | "azure";
export const SIGHTING_SOURCE: Record<SightingProvider, DiscoverySourceKind> = { k8s: "k8s_webhook", github: "repo_scan", azure: "azure" };

/** The provider whose Sightings list a screen for `provider` reads; k8s when it has none of its own. */
export function sightingProviderOf(provider: DiscoveryProvider): SightingProvider {
  return provider === "github" || provider === "azure" ? provider : "k8s";
}

/** The provider whose Sightings list a finding of this collector kind belongs to. */
export function sightingProvider(source: DiscoverySourceKind): SightingProvider | undefined {
  return source === "k8s_webhook" ? "k8s" : source === "repo_scan" ? "github" : source === "azure" ? "azure" : undefined;
}

/** The non-default ref a finding came from, or null on the default branch or off a repository scan. */
export function nonDefaultBranch(agent: DiscoveredAgent): string | null {
  const meta = (agent.metadata ?? {}) as Record<string, unknown>;
  if (meta["is_default_branch"] !== false) return null;
  const b = meta["branch"];
  return typeof b === "string" && b !== "" ? b : null;
}

/**
 * Where an Azure agent came from, in Microsoft's terms: listed by Microsoft
 * Entra Agent ID, listed in the Microsoft 365 agent registry, or inferred by
 * AuthSec from what the identity does. Null for every other source.
 */
export function azureAgentOrigin(agent: DiscoveredAgent): string | null {
  if (agent.source !== "azure") return null;
  const meta = (agent.metadata ?? {}) as Record<string, unknown>;
  if (meta["evidence_source"] === "entra_agent_id") return "Listed by Microsoft Entra Agent ID";
  if (meta["evidence_source"] === "foundry_agent_application") return "Published as a Microsoft Foundry agent application";
  if (meta["evidence_source"] === "azure_bot_service") return "An Azure Bot Service bot";
  if (meta["evidence_source"] === "foundry_project_agent") return "An agent of a Microsoft Foundry project";
  if (meta["evidence_source"] === "logic_apps_agent") return "A Logic Apps workflow running an agent loop";
  if (meta["evidence_source"] === "teams_app_catalog") return "Published to Teams with a bot";
  if (meta["evidence_source"] === "agent_registry") {
    const reg = (meta["registry"] ?? {}) as Record<string, unknown>;
    const platform = typeof reg["platform"] === "string" && reg["platform"] ? ` · for ${reg["platform"]}` : "";
    return `Listed in the Microsoft 365 agent registry${platform}`;
  }
  return evidenceModeOf(agent) === "declared" ? "Listed by Microsoft" : "Inferred from its sign-ins, permissions and federation";
}

/** The facts behind an Azure agent finding, as discovery recorded them. */
export function azureAgentSignals(agent: DiscoveredAgent): string[] {
  const s = (agent.metadata as Record<string, unknown> | undefined)?.["signals"];
  return Array.isArray(s) ? s.map(String) : [];
}

const AZURE_FOUND_IN: Record<string, string> = {
  entra_agent_id: "Entra Agent ID",
  foundry_agent_application: "Foundry agent application",
  foundry_project_agent: "Foundry project",
  agent_registry: "Microsoft 365 agent registry",
  teams_app_catalog: "Teams app catalog",
  azure_bot_service: "Azure Bot Service",
  logic_apps_agent: "Logic Apps",
};

/** Where in Microsoft's services an Azure agent was found, in a few words (the All agents "Found in" column). Null off Azure. */
export function azureAgentFoundIn(agent: DiscoveredAgent): string | null {
  if (agent.source !== "azure") return null;
  const src = azureMetaText(agent, "evidence_source");
  return AZURE_FOUND_IN[src] ?? (evidenceModeOf(agent) === "declared" ? "Listed by Microsoft" : "Inferred by AuthSec");
}

/**
 * The object ID of the Microsoft Entra identity an Azure agent signs in as: its
 * agent identity, or the service principal or managed identity an inferred agent
 * was found from. Null when discovery recorded none (a Teams app or bot may have no identity of its own).
 */
export function azureAgentEntraId(agent: DiscoveredAgent): string | null {
  if (agent.source !== "azure") return null;
  const reg = ((agent.metadata ?? {}) as Record<string, unknown>)["registry"] as Record<string, unknown> | undefined;
  const fromRegistry = typeof reg?.["agent_identity_id"] === "string" ? (reg["agent_identity_id"] as string) : "";
  return azureMetaText(agent, "object_id") || fromRegistry || null;
}

/**
 * An Azure agent's sign-in, as Microsoft records it: deleted from Azure, signed
 * in at a time (Microsoft Entra sign-in logs), active in the last 7 days with no
 * sign-in time (Microsoft 365 usage), or no sign-in recorded.
 */
export type AzureSignIn = { kind: "deleted" } | { kind: "signed_in"; at: string } | { kind: "active" } | { kind: "none" };

export function azureAgentSignIn(agent: DiscoveredAgent): AzureSignIn {
  if (agent.runtime_status === "gone") return { kind: "deleted" };
  const at = azureMetaText(agent, "last_sign_in");
  if (at) return { kind: "signed_in", at };
  return agent.runtime_status === "running" ? { kind: "active" } : { kind: "none" };
}

/** A text field of an Azure agent's metadata, or "" when absent. */
export function azureMetaText(agent: DiscoveredAgent, key: string): string {
  const v = ((agent.metadata ?? {}) as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}
