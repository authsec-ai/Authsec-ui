/**
 * What Discovery can show, per provider, object type and view
 * (SPEC-console-revamp.md *Supported object types per provider*, *Control
 * contract*, *Filter semantics*). One table of facts, so the type switcher,
 * the filter row, the not-collected state and the filter removal on a switch
 * all answer from the same place.
 */

import type { DiscoverySourceKind } from "@/app/api/discoveryApi";

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
  github: ["sightings"],
};

export function supportsType(provider: DiscoveryProvider, type: DiscoveryType): boolean {
  return TYPES_BY_PROVIDER[provider].includes(type);
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

export const FILTER_LABEL: Record<FilterKey, string> = {
  region: "Region",
  lifecycle: "Lifecycle",
  classification: "Classification",
  runtime: "Runtime",
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

export const FILTER_KEYS = Object.keys(FILTER_LABEL) as FilterKey[];

/** The URL parameters that are not type-specific filters. */
export const NON_FILTER_PARAMS = ["provider", "type", "view", "q", "source", "sel", "sort", "evidence", "via"] as const;

/** Server-side or client-side; the filters each list offers. Source is always offered and is not listed. */
export function filterKeysFor(provider: DiscoveryProvider, view: DiscoveryView, type: DiscoveryType): FilterKey[] {
  if (provider === "aws" && view === "published") {
    if (type === "workloads") return ["region", "lifecycle", "classification", "runtime"];
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
  if (provider === "github" && type === "sightings") return ["status", "live"];
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
    else if (!sameView) reason = to.view === "latest" ? "not a Latest collected filter" : "not a Published filter";
    else if (from.type !== to.type) reason = `not a ${NOUN[to.type]} filter`;
    else reason = "not available here";
    removed.push({ key, label: shown, reason });
  });
  return { params: next, removed };
}

/** The collector kind each provider's sightings come from. */
export const SIGHTING_SOURCE: Record<"k8s" | "github", DiscoverySourceKind> = { k8s: "k8s_webhook", github: "repo_scan" };
