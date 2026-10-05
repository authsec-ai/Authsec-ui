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

export const DISCOVERY_PATH = "/iga/discovery";

export const DISCOVERY_PROVIDERS = ["aws", "k8s", "gcp", "github"] as const;
export type DiscoveryProvider = (typeof DISCOVERY_PROVIDERS)[number];

export const DISCOVERY_TYPES = ["workloads", "identities", "resources", "sightings"] as const;
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

/** What the reader sees in a breadcrumb for one list: *Discovery › Workloads*. */
export function typeCrumbLabel(type: DiscoveryType): string {
  return `Discovery › ${TYPE_LABEL[type]}`;
}

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

// Per signed-in user, workspace and object type, so a workspace switch or a
// different sign-in never inherits another's filters, and the identities list
// is not restored when the reader left the workloads list. Memory only.
const lastSearch = new Map<string, string>();

function memoryKey(type: DiscoveryType): string {
  const s = SessionManager.getSession();
  return `${s?.user_id ?? "-"}:${s?.workspace_id ?? "-"}:${type}`;
}

/** Called by Discovery on every change of its query string. */
export function rememberDiscoverySearch(type: DiscoveryType, search: string): void {
  lastSearch.set(memoryKey(type), search);
}

/**
 * The URL that restores the list of `type` as the reader left it — filters,
 * sort, page — or its plain default when they have not been there this session.
 * A breadcrumb segment and a Back control use this.
 */
export function discoveryListHref(type: DiscoveryType): string {
  const remembered = lastSearch.get(memoryKey(type));
  if (remembered && new URLSearchParams(remembered).get("type") === type) return `${DISCOVERY_PATH}${remembered}`;
  return discoveryHref({ type });
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

/**
 * An earlier route's query string, carried into the Discovery URL — never
 * dropped, so an `?account=` link does not silently widen to every account.
 * `account` is Discovery's `source`; every other parameter keeps its name.
 */
export function legacyToDiscovery(route: LegacyDiscoveryRoute, search: string): string {
  const incoming = new URLSearchParams(search);
  const base = LEGACY_BASE[route];
  const out = new URLSearchParams(discoveryHref(base).split("?")[1] ?? "");
  incoming.forEach((value, key) => {
    if (key === "account") out.set("source", value);
    else if (!out.has(key)) out.set(key, value);
  });
  const s = out.toString();
  return s ? `${DISCOVERY_PATH}?${s}` : DISCOVERY_PATH;
}
