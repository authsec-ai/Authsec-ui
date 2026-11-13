/**
 * Machines: computers running the AuthSec Agent Kit (authsec-cli) daemon.
 *
 * A machine registers itself as a discovery source of kind `vm_sensor` named
 * after its host (or the --name given to `connect`), reports the agents it
 * sees as discovered agents (metadata.machine.agent_id), and sends its
 * decisions and detections to the agentkit log. Everything here is pure, so
 * it is tested without rendering.
 */

import type {
  AccessSummary,
  AgentKitEvent,
  BlockRequest,
} from "@/app/api/agentkitApi";
import type { DiscoveredAgent, DiscoverySource } from "@/app/api/discoveryApi";

/** Where the release's install script is published. */
export const AGENTKIT_INSTALL_URL =
  "https://github.com/authsec-ai/authsec-cli/releases/latest/download/install.sh";

/** The name a machine is shown by: letters, digits, dot, dash, underscore. */
const MACHINE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export function machineNameProblem(name: string): string | null {
  if (!name) return "Name the machine.";
  if (!MACHINE_NAME.test(name))
    return "Letters, digits, '.', '_' and '-', starting with a letter or digit (at most 63).";
  return null;
}

export interface MachineSetup {
  name: string;
  /** The control plane's API, where the daemon reports (not the console's address). */
  apiUrl: string;
  workspaceId: string;
  ingestToken: string;
}

/** The commands to paste on the machine, every value filled in. */
export function machineSetupCommands(o: MachineSetup): string[] {
  const api = o.apiUrl.replace(/\/+$/, "");
  return [
    `curl -fsSL ${AGENTKIT_INSTALL_URL} | sudo sh`,
    `echo '${o.ingestToken}' | sudo authsec-cli connect --url ${api} --workspace ${o.workspaceId} --name ${o.name} --token-stdin`,
    "sudo authsec-cli daemon install",
  ];
}

/** The machine that registered under this name since the token was minted. */
export function connectedMachine(
  sources: DiscoverySource[] | undefined,
  name: string,
  since?: string,
): DiscoverySource | undefined {
  const t = since ? Date.parse(since) - 60_000 : 0;
  return sources?.find(
    (s) =>
      s.kind === "vm_sensor" &&
      s.cluster_name === name &&
      (!t || Date.parse(s.last_heartbeat_at ?? s.updated_at) >= t),
  );
}

export function isMachine(s: DiscoverySource): boolean {
  return s.kind === "vm_sensor";
}

/** The recogniser id of a machine's agent (claude-code, codex, ...), or "". */
export function machineAgentId(a: DiscoveredAgent): string {
  const m = (a.metadata?.machine ?? {}) as { agent_id?: unknown };
  return typeof m.agent_id === "string" ? m.agent_id : "";
}

export function machineInstances(a: DiscoveredAgent): number {
  const m = (a.metadata?.machine ?? {}) as { instances?: unknown };
  return typeof m.instances === "number" ? m.instances : 0;
}

export function machineUsers(a: DiscoveredAgent): string[] {
  const m = (a.metadata?.machine ?? {}) as { users?: unknown };
  return Array.isArray(m.users)
    ? m.users.filter((u): u is string => typeof u === "string")
    : [];
}

/** Where a quarantine stands on the machine. */
export function quarantineState(a: DiscoveredAgent): {
  word: string;
  tone: "danger" | "warning" | "neutral";
} {
  if (a.status !== "quarantined") return { word: "", tone: "neutral" };
  if (a.quarantine_enforced_at) return { word: "Quarantined", tone: "danger" };
  if (a.quarantine_enforcement_error)
    return { word: "Quarantined, not applied", tone: "warning" };
  return { word: "Quarantine pending", tone: "warning" };
}

/** A machine's health in a word. */
export function machineStatus(s: DiscoverySource): {
  word: string;
  tone: "success" | "warning" | "neutral";
} {
  if (s.connected) return { word: "Connected", tone: "success" };
  if (!s.last_heartbeat_at)
    return { word: "Waiting for first report", tone: "warning" };
  return { word: "Not reporting", tone: "warning" };
}

export function enforcementWord(s: DiscoverySource): string {
  switch (s.actuation_state) {
    case "on":
      return "On";
    case "pending":
      return "Turning on (waiting for the machine)";
    default:
      return "Off";
  }
}

/* ---------------------------------- logs ---------------------------------- */

const TAG_NAMES: Record<string, string> = {
  ASI02: "Tool misuse",
  ASI03: "Identity and privilege abuse",
  ASI04: "Agentic supply chain",
  ASI10: "Rogue agents",
  LLM02: "Sensitive information disclosure",
  LLM06: "Excessive agency",
};

/** "owasp-agentic:ASI10-rogue-agents" -> { id: "ASI10", label: "ASI10 Rogue agents" }. Internal tags give null. */
export function tagLabel(tag: string): { id: string; label: string } | null {
  const m = /^owasp-(?:agentic|llm):([A-Z]+\d+)/.exec(tag);
  if (!m) return null;
  return { id: m[1], label: `${m[1]} ${TAG_NAMES[m[1]] ?? ""}`.trim() };
}

/** The compliance tags of an event, OWASP only, deduplicated. */
export function complianceTags(
  e: AgentKitEvent,
): { id: string; label: string; tag: string }[] {
  const out = new Map<string, { id: string; label: string; tag: string }>();
  for (const t of e.record?.tags ?? []) {
    const l = tagLabel(t);
    if (l && !out.has(l.id)) out.set(l.id, { ...l, tag: t });
  }
  return [...out.values()];
}

/**
 * The tags machines put on records (authsec-cli internal/siem/tags.go), in
 * full: the log filter matches a record's tag exactly.
 */
export const TAG_FILTERS = [
  "owasp-agentic:ASI02-tool-misuse",
  "owasp-agentic:ASI03-identity-and-privilege-abuse",
  "owasp-agentic:ASI04-agentic-supply-chain-vulnerabilities",
  "owasp-agentic:ASI10-rogue-agents",
  "owasp-llm:LLM02-sensitive-information-disclosure",
  "owasp-llm:LLM06-excessive-agency",
].map((tag) => ({ ...(tagLabel(tag) as { id: string; label: string }), tag }));

/** "host:port", with an IPv6 address in brackets. */
export function hostPort(host: string, port?: number): string {
  if (!port) return host;
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

/** What the event was about, in one line. */
export function eventTarget(e: AgentKitEvent): string {
  const r = e.record ?? {};
  if (r.dst) {
    return hostPort(r.dst.host || r.dst.ip || "", r.dst.port);
  }
  if (r.path) return r.path;
  if (r.args?.length) return r.args.join(" ");
  if (r.comm) return r.comm;
  return r.note ?? "";
}

/** The event as a sentence head: "Blocked network", "Quarantined", "Detected ARTEX". */
export function eventTitle(e: AgentKitEvent): string {
  switch (e.type) {
    case "decision": {
      const what = e.kind && e.kind !== "agent" ? ` ${e.kind}` : "";
      switch (e.action) {
        case "deny":
          return e.enforced ? `Blocked${what}` : `Would block${what}`;
        case "kill":
          return `Stopped${what}`;
        case "quarantine":
          return "Quarantined";
        case "release":
          return "Released";
        case "ask":
          return `Asked about${what}`;
        case "allow":
          return `Allowed${what}`;
        default:
          return `${e.action || "Decision"}${what}`;
      }
    }
    case "detection":
      return `Detected ${e.rule || "threat"}`;
    case "agent_started":
      return "Agent started";
    case "agent_stopped":
      return "Agent stopped";
    case "sensor":
      return "Sensor";
    case "access":
      return "Access summary";
  }
  return e.type;
}

export function eventTone(
  e: AgentKitEvent,
): "danger" | "warning" | "success" | "neutral" {
  if (e.type === "detection")
    return e.severity === "high" ? "danger" : "warning";
  if (e.type === "decision") {
    if (
      e.action === "quarantine" ||
      ((e.action === "deny" || e.action === "kill") && e.enforced)
    )
      return "danger";
    if (e.action === "deny" || e.action === "ask") return "warning";
    if (e.action === "release") return "success";
  }
  return "neutral";
}

/* --------------------------------- access --------------------------------- */

/** One thing an agent reached, with what a right-click "block" would deny. */
export interface AccessRow {
  key: string;
  category: "file" | "network" | "service" | "command";
  label: string;
  detail: string;
  count: number;
  last?: string;
  sensitive?: boolean;
  block: BlockRequest | null;
}

const isIP = (s: string) => /^[0-9.]+$/.test(s) || s.includes(":");

export function accessRows(s: AccessSummary | undefined): AccessRow[] {
  if (!s) return [];
  const rows: AccessRow[] = [];
  for (const f of s.files ?? []) {
    rows.push({
      key: `file:${f.path}`,
      category: "file",
      label: f.path,
      detail: f.access === "write" ? "read and write" : "read",
      count: f.count,
      last: f.last,
      sensitive: f.sensitive,
      block: { type: "path", value: f.path },
    });
  }
  for (const d of s.destinations ?? []) {
    const host = d.host || d.ip || "";
    const service = d.service || (d.llm ? "LLM API" : "");
    rows.push({
      key: `net:${host}:${d.port}`,
      category: "network",
      label: hostPort(host, d.port),
      detail: service,
      count: d.count,
      last: d.last,
      block: host
        ? {
            type: d.host && !isIP(d.host) ? "host" : "cidr",
            value: host,
            port: d.port,
          }
        : null,
    });
  }
  for (const c of s.commands ?? []) {
    const program = c.program ?? c.command ?? "";
    rows.push({
      key: `cmd:${program}`,
      category: "command",
      label: program,
      detail: "",
      count: c.count,
      last: c.last,
      block: program ? { type: "command", value: `${program}*` } : null,
    });
  }
  for (const svc of s.services ?? []) {
    rows.push({
      key: `svc:${svc}`,
      category: "service",
      label: svc,
      detail: "service",
      count: 0,
      block: null,
    });
  }
  return rows;
}

/** How a block reads before it is confirmed. */
export function blockSentence(agent: string, b: BlockRequest): string {
  const who = agent === "*" ? "every agent without its own policy" : agent;
  switch (b.type) {
    case "host":
      return `Deny ${who} connections to ${b.value}${b.port ? ` on port ${b.port}` : ""}.`;
    case "cidr":
      return `Deny ${who} connections to ${b.value}${b.port ? ` on port ${b.port}` : ""}.`;
    case "path":
      return `Deny ${who} access to ${b.value}.`;
    case "command":
      return `Stop ${who} from running ${b.value}.`;
    case "mcp":
      return `Deny ${who} the MCP server ${b.value}.`;
  }
}

/* -------------------------------- policies -------------------------------- */

/** A starting policy for an agent that has none in the console: monitor only. */
export function starterPolicy(agent: string): string {
  const id = agent === "*" ? '"*"' : agent;
  return [
    "apiVersion: authsec.ai/v1",
    "kind: AgentPolicy",
    "agent:",
    `  id: ${id}`,
    "# monitor logs what would be blocked; enforce blocks it.",
    "mode: monitor",
    "network:",
    "  default: allow",
    "  deny: []",
    "filesystem:",
    "  deny:",
    '    - "{home}/.ssh"',
    '    - "{home}/.aws"',
    "commands:",
    "  default: allow",
    "  ask:",
    '    - "git push --force*"',
    "  deny: []",
    "mcp_servers:",
    "  default: allow",
    "",
  ].join("\n");
}

/** A quick check before saving: the server checks the head, the machine runs `policy check`. */
export function policyProblem(agent: string, doc: string): string | null {
  if (!doc.trim()) return "The policy is empty.";
  if (!/^apiVersion:\s*authsec\.ai\/v1\s*$/m.test(doc))
    return "apiVersion must be authsec.ai/v1.";
  if (!/^kind:\s*AgentPolicy\s*$/m.test(doc))
    return "kind must be AgentPolicy.";
  const id = /^\s+id:\s*["']?([^"'\s]+)["']?\s*$/m.exec(doc)?.[1];
  if (id !== agent) return `agent.id must be ${agent === "*" ? '"*"' : agent}.`;
  const mode = /^mode:\s*(\S+)\s*$/m.exec(doc)?.[1];
  if (mode !== "monitor" && mode !== "enforce")
    return "mode must be monitor or enforce.";
  return null;
}
