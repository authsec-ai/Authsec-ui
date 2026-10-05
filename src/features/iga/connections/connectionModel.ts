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

/* --------------------------------- words --------------------------------- */

export const PROVIDER_WORD: Record<ConnectionProvider, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  github: "GitHub",
};

export const TYPE_WORD: Record<ConnectionProvider, string> = {
  aws: "AWS account",
  gcp: "GCP project",
  k8s: "Kubernetes cluster",
  github: "GitHub organisation",
};

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
  | "connected";

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
};

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
  if (c.connection.state === "revoked") return PRIMARY.revoked;
  if (c.connection.state === "authentication_failed") return PRIMARY.auth_failed;
  if (c.connection.state === "not_verified") return PRIMARY.not_verified;
  if (c.scan.state === "failed") return PRIMARY.scan_failed;
  if (c.graph.state === "failed") return PRIMARY.publication_failed;
  if (c.coverage.state === "denied") return PRIMARY.coverage_denied;
  if (c.coverage.state === "partial") return PRIMARY.coverage_partial;
  if (c.scan.state === "running") return PRIMARY.scan_running;
  if (c.scan.state === "queued") return PRIMARY.scan_queued;
  return PRIMARY.connected;
}

/** The surfaces a coverage gap names, in words. */
export function gapWords(c: Connection, max = 2): string {
  const names = c.coverage.gaps.map((g) => {
    const s = readableSurface(g.surface);
    return s.region ? `${s.service} (${s.region})` : s.service;
  });
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
    case "partial":
      return n > 0 ? `Partial — ${n} ${n === 1 ? "surface" : "surfaces"}` : "Partial";
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

/** The cause words and the next step for a stored connection reason code. */
export function reasonCopy(c: Connection): { cause: string; action: string } {
  const code = c.connection.reason_code;
  const summary = cloudConnectorReasonSummary(code);
  const action = reasonAction(c.provider, code);
  if (summary) return { cause: summary, action };
  if (code) return { cause: `Reported: ${code.replace(/_/g, " ")}`, action };
  return { cause: "AuthSec could not confirm this connection", action };
}

function reasonAction(provider: ConnectionProvider, code: string | null): string {
  switch (code) {
    case "auth_refused":
      return provider === "gcp"
        ? "Check that the reader service account still exists and its role grants are in place, then verify."
        : provider === "aws"
          ? "Check the role ARN, the ExternalId in its trust policy and that it trusts AuthSec, then verify."
          : "Check the installation's permissions, then try again.";
    case "throttled":
      return "This is usually temporary. Try again in a moment.";
    case "timeout":
      return "Nothing was proven either way. Try again.";
    case "policy_blocked":
      return "A policy refused the read. Whoever owns the policy has to allow AuthSec through it.";
    case "deployment_misconfigured":
      return "This is an AuthSec configuration problem, not yours. Contact support.";
    case "external_id_not_issued":
      return "Use the ExternalId AuthSec issued for this workspace in the role's trust policy, then verify.";
    case "credential_invalid":
      return "Reconnect with a working credential.";
    case "scope_invalid":
      return "Reconnect with valid settings.";
    default:
      return provider === "k8s"
        ? "Check that the agent is running in the cluster and can reach AuthSec."
        : provider === "github"
          ? "Check that the GitHub App is still installed on the organisation."
          : "Verify the connection to see why.";
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
    case "revoked":
      return { ...p, support: "Its last results are kept, and are no longer reconfirmed." };
    case "auth_failed": {
      const r = reasonCopy(c);
      return { ...p, support: `${r.cause} · ${holdsLine(c)}. ${r.action}` };
    }
    case "not_verified":
      return {
        ...p,
        support:
          c.provider === "k8s"
            ? "No agent has reported yet. Install the agent in the cluster and it will appear here."
            : "Verify the connection to confirm AuthSec can read it.",
      };
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
        support: `${holdsLine(c)} with gaps${gapWords(c) ? ` — ${gapWords(c)}` : ""} · Open Coverage to see what to do.`,
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
    default:
      return c.scan.at ? `Finished ${ago(c.scan.at)}` : "Finished";
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
    default:
      return { text: "—", note: "Not part of the graph" };
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
  return {
    scan: canAdminister && live && cap.scan && c.provider !== "k8s",
    verify: canAdminister && live && cap.verify && (c.provider === "aws" || c.provider === "gcp"),
    editScope: canAdminister && live && cap.edit_scope && (c.provider === "aws" || c.provider === "github"),
    rules: cap.rules && c.provider === "github",
    revoke: canAdminister && live && cap.revoke,
  };
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
  if (c.connection.state === "revoked") return "This connection is revoked; what it found earlier is still in Discovery.";
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

  // Verify (or, for a cluster, the agent's first report).
  if (revoked) {
    steps.push({ key: "verify", title: k8s ? "Agent reporting" : "Verify access", state: "failed", detail: "This connection is revoked." });
  } else if (c.connection.state === "authentication_failed") {
    const r = reasonCopy(c);
    steps.push({ key: "verify", title: k8s ? "Agent reporting" : "Verify access", state: "failed", detail: `${r.cause}. ${r.action}`, action: k8s ? undefined : "verify" });
  } else if (c.connection.state === "not_verified") {
    steps.push({
      key: "verify",
      title: k8s ? "Agent reporting" : "Verify access",
      state: "next",
      detail: k8s ? "Waiting for the agent's first report." : "Not yet verified.",
      action: k8s ? undefined : "verify",
    });
  } else {
    steps.push({
      key: "verify",
      title: k8s ? "Agent reporting" : "Verify access",
      state: "done",
      detail: k8s
        ? `${k8sHealthLine(c)}.`
        : c.connection.verified_at
          ? `Verified ${ago(c.connection.verified_at)}.`
          : "AuthSec can read it.",
    });
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
