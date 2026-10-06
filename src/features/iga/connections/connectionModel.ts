/**
 * What a connection is, in words (SPEC-console-revamp.md §Connections).
 *
 * A connection has four independent conditions — connection, latest scan,
 * coverage, graph — and the list never collapses them into one badge. It names
 * the PRIMARY condition by one deterministic precedence and adds one supporting
 * line that says what still holds and what to do. Everything here is a pure
 * function of the B3 `Connection`, so the list, the detail page and the filters
 * cannot disagree about a connection.
 *
 * Nothing here says more than the evidence does: a failed scan never implies
 * the earlier inventory disappeared, a heartbeat is never inventory currency,
 * and missing coverage detail is "unknown", not "complete".
 */

import { format, formatDistanceToNowStrict } from "date-fns";

import type { Connection, ConnectionProvider } from "@/app/api/connectionsApi";
import type { StatusTone } from "@/components/ui/status-badge";
import { readableSurface } from "@/features/iga/coverage/surfaceNames";
import { discoveryHref, type DiscoveryLocation } from "@/features/iga/discovery/urlState";
import { cloudConnectorReasonSummary } from "@/features/discovery/cloud/cloudConnectorErrorCopy";
import { K8S_COVERAGE_LABEL } from "@/features/iga/discovery/k8s";

/* --------------------------------- words --------------------------------- */

const PROVIDER_WORDS: Record<ConnectionProvider, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  github: "GitHub",
};

/** A provider in words. A provider this console does not know is said to be unknown, never given another's name. */
export function providerWord(provider: string): string {
  return (PROVIDER_WORDS as Record<string, string>)[provider] ?? "Unknown provider";
}

/**
 * What the connection is: from its provider and its scope kind, so a Google
 * Cloud organisation is not called a project. The backend reports a folder as
 * scope kind `project` with the summary "1 folder"; the summary is the only
 * place that says so.
 */
export function typeWord(c: Connection): string {
  switch (c.provider) {
    case "aws":
      return "AWS account";
    case "gcp":
      if (c.scope_kind === "organisation") return "GCP organisation";
      if (c.scope_kind === "project") return /\bfolder\b/i.test(c.scope_summary) ? "GCP folder" : "GCP project";
      return "GCP scope";
    case "k8s":
      return "Kubernetes cluster";
    case "github":
      return "GitHub organisation";
    default:
      return "Unknown connection type";
  }
}

export const PROVIDERS: ConnectionProvider[] = ["aws", "k8s", "gcp", "github"];

export function isConnectionProvider(v: string | null | undefined): v is ConnectionProvider {
  return !!v && (PROVIDERS as string[]).includes(v);
}

export function ago(iso: string | null | undefined): string {
  return iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "";
}

/** "29 Sep", with the year once it is not this year. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
}

/** What the connection is called when it has a friendly name: the id is shown only when it has none. */
export function hasFriendlyName(c: Connection): boolean {
  return !!c.name && c.name !== c.native_id;
}

/* ------------------------------ the four conditions ------------------------------ */

export type PrimaryKey =
  | "revoked"
  | "auth_failed"
  | "not_verified"
  | "scan_failed"
  | "publication_failed"
  | "coverage_denied"
  | "coverage_partial"
  | "scan_running"
  | "scan_queued"
  | "connected"
  | "unknown";

export interface Primary {
  key: PrimaryKey;
  label: string;
  tone: StatusTone;
}

const PRIMARY: Record<PrimaryKey, Primary> = {
  revoked: { key: "revoked", label: "Revoked", tone: "muted" },
  auth_failed: { key: "auth_failed", label: "Authentication failed", tone: "danger" },
  not_verified: { key: "not_verified", label: "Not yet verified", tone: "warning" },
  scan_failed: { key: "scan_failed", label: "Latest scan failed", tone: "danger" },
  publication_failed: { key: "publication_failed", label: "Publication failed", tone: "danger" },
  coverage_denied: { key: "coverage_denied", label: "Coverage denied", tone: "warning" },
  coverage_partial: { key: "coverage_partial", label: "Coverage partial", tone: "warning" },
  scan_running: { key: "scan_running", label: "Scan running", tone: "info" },
  scan_queued: { key: "scan_queued", label: "Scan queued", tone: "info" },
  connected: { key: "connected", label: "Connected", tone: "success" },
  unknown: { key: "unknown", label: "Status unknown", tone: "muted" },
};

const SCAN_STATES = new Set(["never_run", "queued", "running", "finished", "failed"]);

/** Reasons that mean nothing has gone wrong yet: the connection simply has not been proven. */
const WAITING_REASONS = new Set(["no_heartbeat", "integration_unverified", "integration_pending"]);

/** Not verified, and no failure is known: it has never been proven, as opposed to a proof that failed. */
export function neverProven(c: Connection): boolean {
  const r = c.connection.reason_code;
  return r ? WAITING_REASONS.has(r) : !c.connection.verified_at;
}

/** The label for `not_verified`, by what the backend says is the cause. */
function notVerifiedLabel(c: Connection): string {
  const r = c.connection.reason_code;
  switch (c.provider) {
    case "k8s":
      return r === "no_heartbeat" ? "Waiting for agent" : "Agent not reporting";
    case "github":
      return r === "integration_missing" ? "App not installed" : r === "integration_pending" ? "Installation pending" : "Not yet verified";
    default:
      return neverProven(c) ? "Not yet verified" : "Could not verify";
  }
}

/**
 * The primary condition. Precedence, deterministic:
 * Revoked › Authentication failed › Not yet verified › Latest scan failed ›
 * Publication failed › Coverage denied / partial › Scan running / queued ›
 * Connected.
 *
 * "Not yet verified" is a Connection-dimension state the spec's precedence list
 * does not place; it sits directly under Authentication failed because nothing
 * has proved AuthSec can read the source, which outranks any scan outcome.
 */
export function primaryOf(c: Connection): Primary {
  const state = c.connection.state;
  if (state === "revoked") return c.connection.reason_code === "disabled" ? { ...PRIMARY.revoked, label: "Disabled" } : PRIMARY.revoked;
  if (state === "authentication_failed") return PRIMARY.auth_failed;
  if (state === "not_verified") return { ...PRIMARY.not_verified, label: notVerifiedLabel(c) };
  // A state this console does not know is not "connected".
  if (state !== "connected") return PRIMARY.unknown;
  if (c.scan.state === "failed") return PRIMARY.scan_failed;
  if (c.graph.state === "failed") return PRIMARY.publication_failed;
  if (c.coverage.state === "denied") return PRIMARY.coverage_denied;
  if (c.coverage.state === "partial") return PRIMARY.coverage_partial;
  if (c.scan.state === "running") return PRIMARY.scan_running;
  if (c.scan.state === "queued") return PRIMARY.scan_queued;
  if (!SCAN_STATES.has(c.scan.state)) return PRIMARY.unknown;
  return PRIMARY.connected;
}

/** The one surface a Kubernetes cluster's gap names: the agent's whole sweep, not a collection surface. */
export const K8S_SWEEP_SURFACE = "k8s_sweep";

/** A sweep's coverage word as the reader sees it: "namespaces only", "sweep incomplete". */
export function k8sSweepWord(state: string): string {
  return (K8S_COVERAGE_LABEL[state] ?? state.replace(/_/g, " ")).toLowerCase();
}

/** One coverage gap, in words. The Kubernetes sweep is the cluster's, never an API surface called "k8s sweep". */
export function gapName(g: { surface: string; state: string }): string {
  if (g.surface === K8S_SWEEP_SURFACE) return `Cluster sweep: ${k8sSweepWord(g.state)}`;
  const s = readableSurface(g.surface);
  return s.region ? `${s.service} (${s.region})` : s.service;
}

/** The surfaces a coverage gap names, in words. */
export function gapWords(c: Connection, max = 2): string {
  const names = c.coverage.gaps.map(gapName);
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

/** "Partial — 3 surfaces" · "Denied — IAM users" · "Complete" · "Unknown". */
export function coverageText(c: Connection): string {
  const n = c.coverage.gaps.length;
  switch (c.coverage.state) {
    case "complete":
      return "Complete";
    case "partial": {
      if (c.provider === "k8s" && n === 1 && c.coverage.gaps[0].surface === K8S_SWEEP_SURFACE) {
        return `Partial — ${k8sSweepWord(c.coverage.gaps[0].state)}`;
      }
      return n > 0 ? `Partial — ${n} ${n === 1 ? "surface" : "surfaces"}` : "Partial";
    }
    case "denied": {
      const denied = c.coverage.gaps.filter((g) => g.state === "denied");
      if (denied.length === 1) {
        const s = readableSurface(denied[0].surface);
        return `Denied — ${s.region ? `${s.service} (${s.region})` : s.service}`;
      }
      return `Denied — ${denied.length || n} surfaces`;
    }
    default:
      return "Unknown";
  }
}

/** Kubernetes only: is the agent's heartbeat recent while its inventory is not? */
const HEARTBEAT_RECENT_MS = 10 * 60 * 1000;
const INVENTORY_LAG_MS = 2 * 60 * 60 * 1000;

export function heartbeatRecent(c: Connection): boolean {
  const h = c.scan.heartbeat_at;
  return !!h && Date.now() - new Date(h).getTime() <= HEARTBEAT_RECENT_MS;
}

/** The agent is online but its inventory is much older than its heartbeat: the two disagree, and the page says so. */
export function inventoryLagsHeartbeat(c: Connection): boolean {
  const hb = c.scan.heartbeat_at;
  if (!heartbeatRecent(c) || !hb || !c.scan.at) return false;
  return new Date(hb).getTime() - new Date(c.scan.at).getTime() > INVENTORY_LAG_MS;
}

/**
 * Connection health and inventory date for a Kubernetes cluster, kept apart:
 * the heartbeat says the agent is alive; only a sweep says what is in the
 * cluster. When they disagree the sentence says so.
 */
export function k8sHealthLine(c: Connection): string {
  const hb = c.scan.heartbeat_at;
  const online = heartbeatRecent(c);
  if (online && !c.scan.at) return "Agent online; no inventory received yet";
  if (inventoryLagsHeartbeat(c)) return `Agent online; its last inventory is from ${day(c.scan.at)}`;
  if (online) return `Agent online, heartbeat ${ago(hb)}`;
  return hb ? `Agent not heard from since ${ago(hb)}` : "No heartbeat received yet";
}

/* --------------------------- reasons: what failed, what to do --------------------------- */

/** The cause of a reason code that is not a cloud connector's stored error code. */
const CAUSE: Record<string, string> = {
  no_heartbeat: "The agent has not reported yet",
  heartbeat_lost: "The agent has stopped reporting",
  disabled: "This source is disabled",
  integration_missing: "No GitHub App installation is bound to this organisation",
  integration_unverified: "The GitHub App installation has not been verified yet",
  integration_pending: "The GitHub App installation is still pending",
  integration_degraded: "The GitHub App installation is degraded",
  integration_disconnected: "The GitHub App installation was disconnected",
  integration_revoked: "The GitHub App installation was revoked",
};

function causeWithoutCode(c: Connection): string {
  switch (c.connection.state) {
    case "revoked":
      return "AuthSec no longer reads this connection";
    case "not_verified":
      return c.connection.verified_at ? "AuthSec could not confirm this connection just now" : "Nothing has proved AuthSec can read it";
    default:
      return "AuthSec could not confirm this connection";
  }
}

/**
 * The cause words and the next step for a connection's stored reason code,
 * whatever its state: `not_verified` and `revoked` carry causes too (a lost
 * heartbeat, a throttled call, a disconnected installation), and none of them
 * is "never verified".
 */
export function reasonCopy(c: Connection): { cause: string; action: string } {
  const code = c.connection.reason_code;
  const action = reasonAction(c, code);
  const cause = (code ? (CAUSE[code] ?? cloudConnectorReasonSummary(code)) : undefined) ?? (code ? `Reported: ${code.replace(/_/g, " ")}` : causeWithoutCode(c));
  return { cause, action };
}

/** "<what to check>, then verify." — only where this provider has something to verify. */
function checkThenVerify(c: Connection, check: string): string {
  return c.capabilities.verify ? `${check}, then verify.` : `${check}.`;
}

function reasonAction(c: Connection, code: string | null): string {
  const provider = c.provider;
  switch (code) {
    case "auth_refused":
      return provider === "gcp"
        ? checkThenVerify(c, "Check that the reader service account still exists and its role grants are in place")
        : provider === "aws"
          ? checkThenVerify(c, "Check the role ARN, the ExternalId in its trust policy and that it trusts AuthSec")
          : "Check the installation's permissions, then try again.";
    case "throttled":
      return "This is usually temporary. Try again in a moment.";
    case "timeout":
      return "Nothing was proven either way. Try again.";
    case "policy_blocked":
      return "A policy refused the read. Whoever owns the policy has to allow AuthSec through it.";
    case "deployment_misconfigured":
      return "This is an AuthSec configuration problem, not yours. Contact support.";
    case "external_id_unreadable":
      return c.capabilities.verify
        ? "AuthSec could not read this connection's stored ExternalId. Verify the connection; if that fails, reconnect the account."
        : "AuthSec could not read this connection's stored ExternalId. Reconnect the account.";
    case "external_id_not_issued":
      return checkThenVerify(c, "Use the ExternalId AuthSec issued for this workspace in the role's trust policy");
    case "credential_invalid":
      return "Reconnect with a working credential.";
    case "scope_invalid":
      return "Reconnect with valid settings.";
    case "no_heartbeat":
      return "Install the agent in the cluster and it will appear here.";
    case "heartbeat_lost":
      return "Check that the agent is running in the cluster and can reach AuthSec.";
    case "disabled":
      return "It can be removed here.";
    case "integration_missing":
      return "Remove this connection and connect the organisation again.";
    case "integration_unverified":
      return "Check that the GitHub App is still installed on the organisation.";
    case "integration_pending":
      return "Finish installing the GitHub App on the organisation.";
    case "integration_degraded":
      return "Check the permissions the GitHub App holds on the organisation.";
    case "integration_disconnected":
    case "integration_revoked":
      return "Remove this connection, and connect the organisation again to scan it.";
    default:
      if (provider === "k8s") return "Check that the agent is running in the cluster and can reach AuthSec.";
      if (provider === "github") return "Check that the GitHub App is still installed on the organisation.";
      if (!c.capabilities.verify) return "Check the connection's settings with the provider.";
      return c.connection.state === "not_verified" ? "Verify the connection to confirm AuthSec can read it." : "Verify the connection to see why.";
  }
}

/* ---------------------------------- status cell ---------------------------------- */

/** What still holds: said every time, so a failure never implies data disappeared. */
export function holdsLine(c: Connection): string {
  if (c.discovery.ready && c.discovery.as_of) return `Inventory from ${day(c.discovery.as_of)} remains available`;
  if (c.discovery.ready) return "Its last result remains available";
  return "No inventory yet";
}

export interface StatusSummary extends Primary {
  /** One line: what still holds, then what to do. Always visible, never hover-only. */
  support: string;
}

export function statusOf(c: Connection): StatusSummary {
  const p = primaryOf(c);
  switch (p.key) {
    case "revoked": {
      // A cluster or an organisation that is switched off can still be removed; say so.
      if (c.provider === "aws" || c.provider === "gcp") return { ...p, support: "Its last results are kept, and are no longer reconfirmed." };
      return { ...p, support: `${reasonCopy(c).cause}. ${holdsLine(c)}. It can be removed.` };
    }
    case "auth_failed": {
      const r = reasonCopy(c);
      return { ...p, support: `${r.cause} · ${holdsLine(c)}. ${r.action}` };
    }
    case "not_verified": {
      const r = reasonCopy(c);
      // Never proven: there is nothing that "still holds". A proof that failed or a heartbeat that stopped: say what remains.
      return { ...p, support: neverProven(c) ? `${r.cause}. ${r.action}` : `${r.cause} · ${holdsLine(c)}. ${r.action}` };
    }
    case "unknown":
      return { ...p, support: "AuthSec reports a state this console does not recognise. Open the connection for what is known." };
    case "scan_failed":
      return {
        ...p,
        support: `${holdsLine(c)} · ${c.provider === "k8s" ? "Check the agent's logs." : "Scan again, or open the scan to see why."}`,
      };
    case "publication_failed":
      return {
        ...p,
        support: `${
          c.graph.published_at ? `The graph from ${ago(c.graph.published_at)} is still shown` : "Nothing from this account is in the graph yet"
        } · Scan again to retry.`,
      };
    case "coverage_denied":
    case "coverage_partial":
      return {
        ...p,
        support: `${holdsLine(c)} with gaps${gapWords(c) ? ` — ${gapWords(c)}` : ""} · Open Coverage to see ${c.provider === "k8s" ? "what it means" : "what to do"}.`,
      };
    case "scan_running":
    case "scan_queued":
      return { ...p, support: `${holdsLine(c)} · Results update when the scan finishes.` };
    default:
      return { ...p, support: connectedLine(c) };
  }
}

function connectedLine(c: Connection): string {
  if (c.provider === "k8s") return k8sHealthLine(c);
  const parts: string[] = [];
  if (c.scan.state === "finished" && c.scan.at) parts.push(`Latest scan finished ${ago(c.scan.at)}`);
  else if (c.scan.state === "never_run") parts.push("Not scanned yet");
  if (c.coverage.state === "unknown" && c.scan.state === "finished") parts.push("Coverage not reported");
  if (c.graph.state === "published" && c.graph.published_at) parts.push(`Published ${ago(c.graph.published_at)}`);
  return parts.join(" · ");
}

/* ------------------------------------ columns ------------------------------------ */

/** "Finished 6 days ago" · "Failed 2 hours ago" · "Running" · "Queued" · "Never run". */
export function lastScanText(c: Connection): string {
  if (c.provider === "k8s") {
    if (c.scan.state === "never_run" || !c.scan.at) return "No inventory yet";
    return `Inventory ${ago(c.scan.at)}`;
  }
  switch (c.scan.state) {
    case "never_run":
      return "Never run";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "failed":
      return c.scan.at ? `Failed ${ago(c.scan.at)}` : "Failed";
    case "finished":
      return c.scan.at ? `Finished ${ago(c.scan.at)}` : "Finished";
    default:
      return "Unknown";
  }
}

/** The graph column: distinct from the scan outcome. */
export function graphText(c: Connection): { text: string; note?: string } {
  switch (c.graph.state) {
    case "published":
      return { text: c.graph.published_at ? `Published ${ago(c.graph.published_at)}` : "Published", note: c.graph.rev != null ? `Revision ${c.graph.rev}` : undefined };
    case "publishing":
      return { text: "Publishing" };
    case "failed":
      return { text: "Publication failed", note: c.graph.published_at ? `Previous: ${ago(c.graph.published_at)}` : undefined };
    case "not_published":
      return { text: "Not published" };
    case "unrevisioned":
      return { text: "No publication", note: "Written as swept" };
    case "not_applicable":
      return { text: "—", note: "Not part of the graph" };
    default:
      return { text: "Unknown" };
  }
}

/* ---------------------------------- status filter ---------------------------------- */

export type StatusFilterKey = "all" | "connected" | "attention" | "partial" | "running" | "revoked";

export const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "connected", label: "Connected" },
  { key: "attention", label: "Needs attention" },
  { key: "partial", label: "Partial coverage" },
  { key: "running", label: "Scanning" },
  { key: "revoked", label: "Revoked" },
];

export function statusFilterOf(c: Connection): StatusFilterKey {
  switch (primaryOf(c).key) {
    case "revoked":
      return "revoked";
    case "auth_failed":
    case "not_verified":
    case "scan_failed":
    case "publication_failed":
    case "unknown":
      return "attention";
    case "coverage_denied":
    case "coverage_partial":
      return "partial";
    case "scan_running":
    case "scan_queued":
      return "running";
    default:
      return "connected";
  }
}

export function isFilterKey(v: string | null): v is StatusFilterKey {
  return !!v && STATUS_FILTERS.some((f) => f.key === v);
}

/** A scan is in flight, so the page should poll. */
export function scanInFlight(c: Connection): boolean {
  return c.scan.state === "queued" || c.scan.state === "running" || c.graph.state === "publishing";
}

/* ----------------------------------- actions ----------------------------------- */

export interface ActionSet {
  scan: boolean;
  verify: boolean;
  editScope: boolean;
  rules: boolean;
  revoke: boolean;
}

/**
 * Which actions exist for this connection. Capability first (what the provider
 * can do), then what this console can actually perform, then authorisation.
 * An unavailable action is absent, never disabled: a read-only reader sees
 * none of the administrative ones.
 */
export function actionsOf(c: Connection, canAdminister: boolean): ActionSet {
  const live = c.connection.state !== "revoked";
  const cap = c.capabilities;
  // A cluster's or an organisation's "revoke" is the source's DELETE, so a disabled or
  // revoked one must stay removable. AWS and GCP revoke once: a revoked row keeps its history.
  const removable = c.provider === "k8s" || c.provider === "github";
  return {
    scan: canAdminister && live && cap.scan && (c.provider === "aws" || c.provider === "gcp" || c.provider === "github"),
    verify: canAdminister && live && verifiable(c),
    editScope: canAdminister && live && cap.edit_scope && (c.provider === "aws" || c.provider === "github"),
    rules: cap.rules && c.provider === "github",
    revoke: canAdminister && cap.revoke && (live || removable) && (removable || c.provider === "aws" || c.provider === "gcp"),
  };
}

/** Does this provider have a verify route that this console calls? GitHub has none. */
function verifiable(c: Connection): boolean {
  return c.capabilities.verify && (c.provider === "aws" || c.provider === "gcp");
}

/** The word for the destructive action: AWS and GCP are revoked, a cluster and an organisation are removed. */
export function revokeWord(c: Connection): { verb: string; noun: string } {
  return c.provider === "aws" || c.provider === "gcp"
    ? { verb: "Revoke", noun: "revoke" }
    : { verb: "Remove connection", noun: "remove" };
}

/* ------------------------------------- tabs ------------------------------------- */

export type DetailTab = "overview" | "scans" | "coverage" | "scope" | "rules";

export function tabsOf(c: Connection): { key: DetailTab; label: string }[] {
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "scans", label: "Scans" },
    { key: "coverage", label: "Coverage" },
    { key: "scope", label: "Scope" },
  ];
  if (c.provider === "github") tabs.push({ key: "rules", label: "Scan rules" });
  return tabs;
}

export function detailHref(id: string, tab: DetailTab = "overview"): string {
  const base = `/iga/connections/${encodeURIComponent(id)}`;
  return tab === "overview" ? base : `${base}/${tab}`;
}

export function scanHref(id: string, runId: string): string {
  return `${detailHref(id)}/scans/${encodeURIComponent(runId)}`;
}

/* ------------------------------- Discovery readiness ------------------------------- */

/**
 * Where "Open in Discovery" lands, by the provider's own rule
 * (SPEC-console-revamp.md §First successful journey). `discovery.ready` is the
 * backend's verdict — a successful empty result counts as ready.
 */
export function discoveryLocation(c: Connection): DiscoveryLocation {
  switch (c.provider) {
    case "aws":
      return c.graph.state === "published"
        ? { provider: "aws", type: "workloads", view: "published", source: c.id }
        : { provider: "aws", type: "workloads", view: "latest", source: c.id };
    case "gcp":
      return { provider: "gcp", type: "identities", source: c.id };
    case "k8s":
      return { provider: "k8s", type: "workloads", source: c.id };
    default:
      return { provider: "github", type: "sightings", source: c.id };
  }
}

export function discoveryLink(c: Connection): string {
  return discoveryHref(discoveryLocation(c));
}

/** Why "Open in Discovery" is not offered yet — said, not just disabled. */
export function discoveryWaitingFor(c: Connection): string {
  if (c.connection.state === "revoked") return "This connection is revoked, so nothing new will be read from it.";
  switch (c.provider) {
    case "k8s":
      return "Waiting for a usable sweep from the agent.";
    case "github":
      return "Waiting for a completed scan of the organisation.";
    case "gcp":
      return "Waiting for collected identities for this project.";
    default:
      return "Waiting for the first scan to finish.";
  }
}

/* ------------------------------------ tracker ------------------------------------ */

export type StepState = "done" | "next" | "working" | "failed" | "waiting";

export interface Step {
  key: string;
  title: string;
  state: StepState;
  /** What is true now, in a sentence. */
  detail: string;
  /** The next action, when this step is the one to act on. */
  action?: "verify" | "scan" | "scope" | "open";
}

export const STEP_STATE_WORD: Record<StepState, string> = {
  done: "Done",
  next: "Next",
  working: "In progress",
  failed: "Failed",
  waiting: "Waiting",
};

/**
 * connect → verify → choose scope → scan → result available → (AWS: graph
 * published) → open Discovery. Each step says its state and its next action,
 * so the operator never infers "is it ready?" from timestamps. *Scan finished*
 * and *Result available* are two steps: "available" means the provider's own
 * readiness rule holds, not that objects were found.
 */
export function trackerOf(c: Connection, opts: { scopeChosen: boolean }): Step[] {
  const revoked = c.connection.state === "revoked";
  const k8s = c.provider === "k8s";
  const steps: Step[] = [];

  steps.push({
    key: "connect",
    title: "Connect",
    state: "done",
    detail: `Connected ${day(c.created_at)}.`,
  });

  // Verify (or, for a cluster, the agent's first report; for GitHub, the App installation, which has no verify route).
  const verifyTitle = k8s ? "Agent reporting" : c.provider === "github" ? "GitHub App installation" : "Verify access";
  const verifyAction = verifiable(c) ? ("verify" as const) : undefined;
  const state = c.connection.state;
  if (state === "revoked") {
    steps.push({ key: "verify", title: verifyTitle, state: "failed", detail: `${reasonCopy(c).cause}.` });
  } else if (state === "authentication_failed") {
    const r = reasonCopy(c);
    steps.push({ key: "verify", title: verifyTitle, state: "failed", detail: `${r.cause}. ${r.action}`, action: verifyAction });
  } else if (state === "not_verified") {
    const r = reasonCopy(c);
    steps.push({
      key: "verify",
      title: verifyTitle,
      // Never proven is a step still to do; a failed proof or a lost heartbeat is a failure with a cause.
      state: neverProven(c) ? "next" : "failed",
      detail: k8s && c.connection.reason_code === "no_heartbeat" ? "Waiting for the agent's first report." : `${r.cause}. ${r.action}`,
      action: verifyAction,
    });
  } else if (state === "connected") {
    steps.push({
      key: "verify",
      title: verifyTitle,
      state: "done",
      detail: k8s
        ? `${k8sHealthLine(c)}.`
        : c.connection.verified_at
          ? `Verified ${ago(c.connection.verified_at)}.`
          : "AuthSec can read it.",
    });
  } else {
    steps.push({ key: "verify", title: verifyTitle, state: "waiting", detail: "AuthSec reports a connection state this console does not recognise." });
  }

  // Scope.
  steps.push({
    key: "scope",
    title: "Choose scope",
    state: opts.scopeChosen ? "done" : revoked ? "waiting" : "next",
    detail: opts.scopeChosen
      ? `${capitalise(c.scope_summary || "Scope set")}.`
      : c.provider === "github"
        ? "No repositories are selected, so a scan would look at nothing."
        : "No scope is recorded yet.",
    action: opts.scopeChosen || revoked || c.provider === "k8s" ? undefined : "scope",
  });

  // Scan.
  const scanTitle = k8s ? "Agent sweep" : "Scan";
  const verified = c.connection.state === "connected";
  switch (c.scan.state) {
    case "queued":
      steps.push({ key: "scan", title: scanTitle, state: "working", detail: "Queued. It starts when the worker is free." });
      break;
    case "running":
      steps.push({ key: "scan", title: scanTitle, state: "working", detail: k8s ? "A sweep is running." : "Running." });
      break;
    case "failed":
      steps.push({ key: "scan", title: scanTitle, state: "failed", detail: `Failed ${ago(c.scan.at)}.`, action: k8s ? undefined : "scan" });
      break;
    case "finished":
      steps.push({
        key: "scan",
        title: scanTitle,
        state: "done",
        detail: k8s ? `Inventory from ${day(c.scan.at)}.` : `Finished ${ago(c.scan.at)}.`,
      });
      break;
    default:
      steps.push({
        key: "scan",
        title: scanTitle,
        state: verified && opts.scopeChosen && !revoked ? "next" : "waiting",
        detail: k8s ? "The agent has not swept yet. It reports on its own schedule." : "Never run.",
        action: k8s ? undefined : verified && opts.scopeChosen && !revoked ? "scan" : undefined,
      });
  }

  // Result available.
  steps.push({
    key: "result",
    title: "Result available",
    state: c.discovery.ready ? "done" : c.scan.state === "failed" ? "failed" : c.scan.state === "queued" || c.scan.state === "running" ? "working" : "waiting",
    detail: c.discovery.ready
      ? c.discovery.as_of
        ? `Available from ${day(c.discovery.as_of)}${c.scan.state === "failed" ? " (an earlier scan)" : ""}.`
        : "Available."
      : c.scan.state === "finished"
        ? "The scan finished, but no usable result is recorded yet."
        : "No result yet.",
  });

  if (c.provider === "aws") {
    steps.push({
      key: "graph",
      title: "Graph published",
      state:
        c.graph.state === "published"
          ? "done"
          : c.graph.state === "publishing"
            ? "working"
            : c.graph.state === "failed"
              ? "failed"
              : "waiting",
      detail:
        c.graph.state === "published"
          ? `Published ${ago(c.graph.published_at)}${c.graph.rev != null ? ` as revision ${c.graph.rev}` : ""}.`
          : c.graph.state === "publishing"
            ? "Building the graph from the latest scan."
            : c.graph.state === "failed"
              ? c.graph.published_at
                ? `Publication failed. The graph from ${ago(c.graph.published_at)} is still shown.`
                : "Publication failed. Nothing is in the graph yet."
              : "Not published yet. The Published view in Discovery stays empty until it is.",
    });
  }

  steps.push({
    key: "open",
    title: "Open in Discovery",
    state: c.discovery.ready ? "next" : "waiting",
    detail: c.discovery.ready
      ? c.provider === "aws" && c.graph.state !== "published"
        ? "Opens the latest collected view; it is not in a publication yet."
        : "Ready."
      : discoveryWaitingFor(c),
    action: c.discovery.ready ? "open" : undefined,
  });

  return steps;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
