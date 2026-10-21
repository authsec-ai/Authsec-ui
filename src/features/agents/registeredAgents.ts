/**
 * Agents registered from this browser that no MCP server has seen yet.
 *
 * POST /authsec/agents mints the agent's client, but the backend has no
 * endpoint that lists registered agents: an agent only appears in the
 * workspace client registry (GET /authsec/clients) once it reaches its first
 * MCP server. Until then the Agents list would not show it at all, so we
 * remember what this browser registered (name, client ID, servers picked —
 * never the secret) and show those rows as "Waiting for first connection".
 * A row drops off as soon as the registry lists the client.
 *
 * Per browser and per workspace only — replace with a backend list endpoint
 * when one exists.
 */

import { SessionManager } from "@/utils/sessionManager";

export interface RegisteredAgent {
  client_id: string;
  name: string;
  redirect_uri: string;
  /** MCP server names picked in the wizard (informational). */
  servers: string[];
  /**
   * MCP server ids picked in the wizard. Optional: older entries only carry
   * names, which the Agents list resolves against the server list.
   */
  server_ids?: string[];
  /**
   * What was registered. The backend client registry has no voice kind (a
   * voice agent is an `agent` client), so this is the only record of it.
   * Missing means an AI agent.
   */
  kind?: "ai" | "voice";
  registered_at: string;
}

const keyFor = () => {
  const ws = SessionManager.getSession()?.workspace_id ?? "default";
  return `authsec.registeredAgents.${ws}`;
};

export function readRegisteredAgents(): RegisteredAgent[] {
  try {
    const raw = window.localStorage.getItem(keyFor());
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RegisteredAgent[]).filter((a) => a && a.client_id) : [];
  } catch {
    return [];
  }
}

function write(list: RegisteredAgent[]) {
  try {
    window.localStorage.setItem(keyFor(), JSON.stringify(list));
  } catch {
    // Storage unavailable (private window, blocked site data): the agent is
    // still registered; it just won't be listed until it connects.
  }
}

export function rememberRegisteredAgent(agent: RegisteredAgent) {
  write([agent, ...readRegisteredAgents().filter((a) => a.client_id !== agent.client_id)]);
}

export function updateRegisteredAgentServers(clientId: string, servers: string[]) {
  write(readRegisteredAgents().map((a) => (a.client_id === clientId ? { ...a, servers } : a)));
}

export function forgetRegisteredAgent(clientId: string) {
  write(readRegisteredAgents().filter((a) => a.client_id !== clientId));
}
