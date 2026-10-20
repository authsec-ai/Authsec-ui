/**
 * The Discovery URL contract (SPEC-console-revamp.md §Discovery, §Route map).
 *
 * Everything the reader sees in Discovery — provider, object type, view, search,
 * filters — lives in the query string, so a view can be shared, bookmarked and
 * restored by Back. Every earlier route that now redirects here carries its
 * parameters through `legacyToDiscovery`, and every detail page returns to the
 * list the reader left through `discoveryListHref`.
 *
 *   /iga/discovery?provider=aws&type=workloads&view=published&q=refund&source=<connection id>
 *
 * `provider`  aws · k8s · gcp · github    absent: the default rule (DiscoveryPage)
 * `type`      workloads · identities · resources · sightings    default: workloads
 * `view`      published · latest          default: published (AWS only)
 * `q`         search text
 * `source`    one connection's id (connector id, or discovery source id)
 * anything else is a type-specific filter, named by its facet (`region`,
 * `lifecycle`, `classification`, `runtime`, `kind`, …).
 */

import { SessionManager } from "@/utils/sessionManager";

import type { RemovedFilter } from "./model";

export const DISCOVERY_PATH = "/iga/discovery";

export const DISCOVERY_PROVIDERS = ["aws", "k8s", "gcp", "github"] as const;
export type DiscoveryProvider = (typeof DISCOVERY_PROVIDERS)[number];

const DISCOVERY_TYPES = ["workloads", "identities", "resources", "sightings"] as const;
export type DiscoveryType = (typeof DISCOVERY_TYPES)[number];

export const DISCOVERY_VIEWS = ["published", "latest"] as const;
export type DiscoveryView = (typeof DISCOVERY_VIEWS)[number];

export const PROVIDER_LABEL: Record<DiscoveryProvider, string> = {
  aws: "AWS",
  k8s: "Kubernetes",
  gcp: "Google Cloud",
  github: "GitHub",
};

export const TYPE_LABEL: Record<DiscoveryType, string> = {
  workloads: "Workloads",
  identities: "Identities",
  resources: "Resources",
  sightings: "Sightings",
};

export function isProvider(v: string | null | undefined): v is DiscoveryProvider {
  return !!v && (DISCOVERY_PROVIDERS as readonly string[]).includes(v);
}
export function isType(v: string | null | undefined): v is DiscoveryType {
  return !!v && (DISCOVERY_TYPES as readonly string[]).includes(v);
}
export function isView(v: string | null | undefined): v is DiscoveryView {
  return !!v && (DISCOVERY_VIEWS as readonly string[]).includes(v);
}

export interface DiscoveryLocation {
  provider?: DiscoveryProvider;
  type?: DiscoveryType;
  view?: DiscoveryView;
  q?: string;
  source?: string;
  /** Type-specific filters: facet name → value. */
  filters?: Record<string, string | undefined>;
}

/** A Discovery URL. Empty values are omitted so URLs stay short and stable. */
export function discoveryHref(loc: DiscoveryLocation = {}): string {
  const p = new URLSearchParams();
  if (loc.provider) p.set("provider", loc.provider);
  if (loc.type) p.set("type", loc.type);
  if (loc.view) p.set("view", loc.view);
  if (loc.q) p.set("q", loc.q);
  if (loc.source) p.set("source", loc.source);
  for (const [k, v] of Object.entries(loc.filters ?? {})) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${DISCOVERY_PATH}?${s}` : DISCOVERY_PATH;
}

/* ----------------------- returning to the list the reader left ---------------------- */

// Per signed-in user, workspace, provider and object type, so a workspace switch
// or a different sign-in never inherits another's filters, and the AWS workloads
// list is not restored when the reader left the Kubernetes one. Memory only.
const lastSearch = new Map<string, string>();

function memoryKey(type: DiscoveryType, provider: DiscoveryProvider | "*"): string {
  const s = SessionManager.getSession();
  return `${s?.user_id ?? "-"}:${s?.workspace_id ?? "-"}:${provider}:${type}`;
}

/**
 * Called by Discovery on every change of its query string. The list is also
 * remembered as the type's latest of any provider, for a caller that cannot yet
 * say which provider an object belongs to.
 */
export function rememberDiscoverySearch(provider: DiscoveryProvider, type: DiscoveryType, search: string): void {
  lastSearch.set(memoryKey(type, provider), search);
  lastSearch.set(memoryKey(type, "*"), search);
}

/**
 * The URL that restores the list of `type` for `provider` as the reader left
 * it — filters, sort, page — or its plain default when they have not been there
 * this session. A breadcrumb segment and a Back control use this. With no
 * provider (the object has not loaded yet) it is the list of that type the
 * reader was last on, whichever provider that was.
 */
export function discoveryListHref(type: DiscoveryType, provider?: DiscoveryProvider): string {
  const remembered = lastSearch.get(memoryKey(type, provider ?? "*"));
  if (remembered) {
    const q = new URLSearchParams(remembered);
    if (q.get("type") === type && (!provider || q.get("provider") === provider)) return `${DISCOVERY_PATH}${remembered}`;
  }
  return discoveryHref({ provider, type });
}

/* ------------------------------ earlier routes → here ------------------------------- */

export type LegacyDiscoveryRoute =
  | "estate"
  | "identities"
  | "resources"
  | "cloud-identities"
  | "cloud-compute"
  | "cloud-resources"
  | "agents"
  | "k8s-access";

const LEGACY_BASE: Record<LegacyDiscoveryRoute, DiscoveryLocation> = {
  estate: { provider: "aws", type: "workloads" },
  identities: { provider: "aws", type: "identities" },
  resources: { provider: "aws", type: "resources" },
  "cloud-identities": { provider: "aws", type: "identities", view: "latest" },
  "cloud-compute": { provider: "aws", type: "workloads", view: "latest" },
  "cloud-resources": { provider: "aws", type: "resources", view: "latest" },
  agents: { type: "sightings" },
  "k8s-access": { provider: "k8s", type: "workloads" },
};

export interface LegacyRedirect {
  to: string;
  /** History state for the redirect: what could not be carried, shown once as chips. */
  state?: { removed: RemovedFilter[] };
}

/**
 * An earlier route's query string, carried into the Discovery URL — never
 * dropped, so an `?account=` link does not silently widen to every account.
 * What an earlier page called something else is renamed to what Discovery reads:
 *
 *   account (repeatable)      → source: ONE connection. A link naming several is
 *                               narrowed to the first, and the redirect's state
 *                               says so (the source filter takes one value)
 *   runtime_kind              → runtime
 *   classification=agent      → classified_agent (the earlier "agent" was both
 *                               agent classes; the other is named in the notice)
 *   used_by=workloads         → bound=1
 *   kind=exact|selector|external on Resources → representation / external=1
 *   kind=gcp_service_account on Cloud identities → the Google Cloud list
 *   view=workload-identities on Compute → section
 *
 * Everything else keeps its name. The earlier Compute page showed every account
 * by design, so its `account` was never a scope and is not carried.
 */
export function legacyRedirect(route: LegacyDiscoveryRoute, search: string): LegacyRedirect {
  const incoming = new URLSearchParams(search);
  const removed: RemovedFilter[] = [];
  let base = LEGACY_BASE[route];
  if (route === "cloud-identities" && incoming.get("kind") === "gcp_service_account") {
    base = { provider: "gcp", type: "identities", view: "latest" };
  }
  const out = new URLSearchParams(discoveryHref(base).split("?")[1] ?? "");
  const set = (key: string, value: string) => {
    if (!out.has(key)) out.set(key, value);
  };

  const accounts = incoming.getAll("account").filter(Boolean);
  if (route !== "cloud-compute" && accounts.length && !incoming.get("source")) {
    out.set("source", accounts[0]);
    if (accounts.length > 1) {
      removed.push({
        key: "account",
        label: `${accounts.length - 1} more ${accounts.length === 2 ? "account" : "accounts"}`,
        reason: "Discovery shows one source at a time, so the first is kept",
      });
    }
  }

  incoming.forEach((value, key) => {
    if (key === "account" || !value) return;
    if (key === "runtime_kind") set("runtime", value);
    else if (key === "classification" && value === "agent") {
      set("classification", "classified_agent");
      removed.push({ key, label: "Agents (both kinds)", reason: "now one kind at a time: classified by a person is kept, provider-native is its own option" });
    } else if (key === "used_by") {
      if (value === "workloads") set("bound", "1");
    } else if (key === "kind" && route === "resources") {
      if (value === "external") set("external", "1");
      else if (value === "exact" || value === "selector") set("representation", value);
    } else if (key === "kind" && base.provider === "gcp") {
      // The Google Cloud list is service accounts only.
    } else if (key === "view" && route === "cloud-compute") {
      if (value === "workload-identities") set("section", value);
    } else set(key, value);
  });

  const s = out.toString();
  return { to: s ? `${DISCOVERY_PATH}?${s}` : DISCOVERY_PATH, state: removed.length ? { removed } : undefined };
}

/** The Discovery URL for an earlier route. See `legacyRedirect`. */
export function legacyToDiscovery(route: LegacyDiscoveryRoute, search: string): string {
  return legacyRedirect(route, search).to;
}
