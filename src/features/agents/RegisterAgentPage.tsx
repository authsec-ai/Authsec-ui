/**
 * `RegisterAgentPage` — Register agent (/agents/new), one page:
 *
 *   ① Users            identity provider people sign in through
 *   ② Agent            type (AI agent · Voice agent · Service account), name, …
 *   ③ Grant MCP Access MCPs and a role on each
 *   ④ SDK Integration  credentials (secret shown once) + config
 *   ⑤ Test Integration live checks, polled every 5 s while testing
 *
 * The same page creates service accounts (Type = Service account), so
 * /service-accounts/new renders it preset to that type. `?type=ai|voice|service`
 * and `?mcp=<id>[,<id>]` preselect the type and MCPs.
 *
 * Backend calls (no invented endpoints):
 *   AI / voice agent
 *     POST /authsec/agents                                  client ID + secret
 *     GET  /authsec/clients                                 "Agent recognised"
 *     GET  /authsec/applications/:id/connections|requests   sign-in, tool request, result
 *     POST …/requests/:id/approve                           one-click approve as the chosen role
 *   Service account
 *     POST /authsec/uflow/admin/service-accounts            create
 *     POST …/service-accounts/:id/credentials               client secret / private-key JWT
 *     POST /authsec/applications/:rs/access/workloads       grant (secret / JWT)
 *     POST /authsec/applications/:rs/machine-access/workload grant (Kubernetes)
 *     GET  /authsec/logs/m2m/paginated?client_id=…          "Token issued"
 *
 * Backend limits this page works within:
 * - POST /authsec/agents takes only name + redirect_uris: an agent has no
 *   owner field, no identity-provider binding and no role binding at
 *   registration. Access starts as an access request the first time the agent
 *   calls an MCP; the test offers "Approve as <role>" when it arrives.
 * - No endpoint lists registered agents, so this browser remembers the new
 *   agent (registeredAgents.ts) until it reaches an MCP.
 * - Credential expiry is not offered: no endpoint accepts one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useApproveRequestMutation,
  useCreateWorkspaceServiceAccountMutation,
  useGrantWorkloadAccessMutation,
  useListAccessRequestsQuery,
  useListConnectionsQuery,
  useProvisionWorkloadCredentialMutation,
  useRegisterAgentMutation,
  type WorkspaceServiceAccount,
} from "@/app/api/agentIdentityApi";
import { useCreateAppWorkloadMutation } from "@/app/api/appWorkloadsApi";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { useGetM2MLogsQuery } from "@/app/api/logsApi";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import type { RSRole } from "@/app/api/setupWizardApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckList,
  CheckRow,
  CopyCodeButton,
  DarkCode,
  FieldHelp,
  FieldLabel,
  SectionCard,
  SectionRow,
  Segmented,
  SetupLayout,
  SidePanel,
  Waiting,
} from "@/features/applications/create/SetupForm";
import { Notice } from "@/features/applications/create/WizardParts";
import { AUTHSEC_DIRECTORY, IdentityProviderPicker } from "@/features/identity-providers/IdentityProviderPicker";
import { computeTokenURL } from "@/features/resource-servers/resource-server-utils";
import { SessionManager } from "@/utils/sessionManager";

import { rememberRegisteredAgent } from "./registeredAgents";
import { CredentialRow, ServerRolePicker, type ServerRoleSelection } from "./wizard";
import { apiErrorMessage, roleLabel } from "./wizard-utils";

const POLL_MS = 5000;

export type AgentType = "ai" | "voice" | "service";

const TYPE_OPTIONS: { value: AgentType; label: string }[] = [
  { value: "ai", label: "AI agent" },
  { value: "voice", label: "Voice agent" },
  { value: "service", label: "Service account" },
];

type RunsOn = "desktop" | "web" | "server";

const RUNS_ON: { value: RunsOn; label: string; redirect: string; hint: string }[] = [
  {
    value: "desktop",
    label: "Desktop or CLI",
    redirect: "http://localhost:8126/callback",
    hint: "A loopback address on the person's machine. The default matches the sample agent.",
  },
  { value: "web", label: "Web app", redirect: "https://", hint: "The HTTPS page of your app that receives the sign-in result." },
  { value: "server", label: "Server", redirect: "https://", hint: "The HTTPS callback on your server that receives the sign-in result." },
];

type Method = "secret" | "jwks" | "kubernetes";

const METHODS: { value: Method; label: string }[] = [
  { value: "secret", label: "Client secret" },
  { value: "jwks", label: "Private-key JWT" },
  { value: "kubernetes", label: "Kubernetes (SPIFFE)" },
];

type Language = "python" | "node" | "go";
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "node", label: "Node.js" },
  { value: "go", label: "Go" },
];

interface RegisteredAgentCreds {
  client_id: string;
  client_secret: string;
  issuer: string;
}

interface Grant {
  serverId: string;
  serverName: string;
  roleName: string;
  ok: boolean;
  error?: string;
  resource?: string;
  scopes?: string[];
  installSnippet?: string;
  spiffeId?: string;
  clientId?: string;
}

interface CreatedServiceAccount {
  sa: WorkspaceServiceAccount;
  clientId?: string;
  clientSecret?: string;
  grants: Grant[];
  createdAt: string;
}

function mask(secret: string): string {
  if (secret.length <= 10) return "•".repeat(secret.length);
  return `${secret.slice(0, 8)}${"•".repeat(10)}${secret.slice(-4)}`;
}

function toType(value: string | null): AgentType | null {
  return value === "ai" || value === "voice" || value === "service" ? value : null;
}

/** Credentials as env vars, plus how to read them in the chosen language. */
function agentConfig(creds: RegisteredAgentCreds, secret: string, servers: string[], language: Language): string {
  const env = [
    `AGENT_CLIENT_ID=${creds.client_id}`,
    `AGENT_CLIENT_SECRET=${secret}`,
    `AUTHSEC_ISSUER=${creds.issuer}`,
    ...(servers.length ? [`AUTHSEC_MCP_SERVERS=${servers.join(",")}`] : []),
  ].join("\n");
  const read =
    language === "python"
      ? `import os\n\nclient_id = os.environ["AGENT_CLIENT_ID"]\nclient_secret = os.environ["AGENT_CLIENT_SECRET"]\nissuer = os.environ["AUTHSEC_ISSUER"]`
      : language === "node"
        ? `const clientId = process.env.AGENT_CLIENT_ID;\nconst clientSecret = process.env.AGENT_CLIENT_SECRET;\nconst issuer = process.env.AUTHSEC_ISSUER;`
        : `clientID := os.Getenv("AGENT_CLIENT_ID")\nclientSecret := os.Getenv("AGENT_CLIENT_SECRET")\nissuer := os.Getenv("AUTHSEC_ISSUER")`;
  return `# .env\n${env}\n\n# Read them in your agent. OAuth endpoints: <issuer>/.well-known/openid-configuration\n${read}`;
}

// ── Test rows: AI / voice agent ──────────────────────────────────────────────

/** Live rows for one MCP: user signed in, tool request, result. */
function AgentServerChecks({
  serverId,
  serverName,
  clientId,
  role,
  polling,
}: {
  serverId: string;
  serverName: string;
  clientId: string;
  role?: RSRole;
  polling: boolean;
}) {
  const { data: conns, isError: connErr } = useListConnectionsQuery(serverId, {
    pollingInterval: polling ? POLL_MS : 0,
  });
  const connection = conns?.items.find((c) => c.client_id === clientId || c.connection_id === clientId);
  const connected = connection?.status === "approved";
  const { data: reqs } = useListAccessRequestsQuery(serverId, { pollingInterval: polling && !connected ? POLL_MS : 0 });
  const mine = reqs?.items.filter((r) => r.requester_client_id === clientId) ?? [];
  const pending = mine.find((r) => r.status === "pending");
  const denied = mine.find((r) => r.status === "denied");
  const [approve, { isLoading: approving }] = useApproveRequestMutation();

  const user = pending?.acting_user
    ? pending.acting_user.name
      ? `${pending.acting_user.name} (${pending.acting_user.email})`
      : pending.acting_user.email
    : connection?.authority?.type === "user"
      ? connection.authority.name
      : null;
  const reached = Boolean(connection || pending || denied);
  const waiting = polling ? "running" : "pending";

  return (
    <>
      <CheckRow
        state={user ? "done" : waiting}
        title="User signed in"
        detail={user ?? (polling ? "Waiting for a person to sign in through the agent…" : "The person the agent acts for")}
      />
      <CheckRow
        state={reached ? "done" : connErr ? "failed" : waiting}
        title={`Tool request to ${serverName}`}
        detail={
          reached
            ? `Received at ${format(new Date((connection ?? pending ?? denied)!.created_at), "HH:mm")}`
            : connErr
              ? "Couldn't read this MCP's connections."
              : polling
                ? "Waiting for the agent to call a tool…"
                : "The agent's first call to this MCP"
        }
      />
      {connected ? (
        <CheckRow
          state="done"
          title="Result"
          detail={`Allowed${connection?.granted_through?.role_name ? ` · role ${roleLabel(connection.granted_through.role_name)}` : ""}`}
        />
      ) : pending ? (
        <CheckRow
          state="action"
          title="Result"
          detail={
            pending.acting_user
              ? `Waiting for approval. Approving gives ${user} the ${role ? roleLabel(role.name) : "chosen"} role on ${serverName}.`
              : "Waiting for approval. The signed-in person couldn't be matched to a user in this workspace."
          }
          action={
            role && pending.acting_user ? (
              <Button
                size="sm"
                className="text-white"
                disabled={approving}
                onClick={async () => {
                  try {
                    await approve({ rsId: serverId, requestId: pending.request_id, roleId: role.id }).unwrap();
                    toast.success(`Approved on ${serverName}.`);
                  } catch (err) {
                    toast.error(apiErrorMessage(err, "Couldn't approve the request."));
                  }
                }}
              >
                {approving ? "Approving…" : `Approve as ${roleLabel(role.name)}`}
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/applications/${serverId}/connections`}>Review</Link>
              </Button>
            )
          }
        />
      ) : denied ? (
        <CheckRow state="failed" title="Result" detail="Denied on this MCP's Connections tab." />
      ) : (
        <CheckRow state="pending" title="Result" detail="Allowed or denied, with the reason" />
      )}
    </>
  );
}

// ── Test rows: service account ───────────────────────────────────────────────

function ServiceAccountChecks({ clientId, since, polling }: { clientId: string; since: string; polling: boolean }) {
  const workspaceId = SessionManager.getSession()?.workspace_id;
  const { data, isError } = useGetM2MLogsQuery(
    { workspace_id: workspaceId ?? "", page: 1, page_size: 20, client_id: clientId },
    { skip: !workspaceId, pollingInterval: polling ? POLL_MS : 0 },
  );
  const sinceMs = new Date(since).getTime() - 60_000;
  const rows = (data?.logs ?? []).filter((l) => new Date(l.createdAt).getTime() >= sinceMs);
  const issued = rows.find((l) => l.gateEffect === "permit");
  const denied = !issued ? rows.find((l) => l.gateEffect === "deny") : undefined;
  const first = rows.at(-1);
  const waiting = polling ? "running" : "pending";

  if (!workspaceId || isError) {
    return (
      <CheckRow
        state="failed"
        title="Token requests"
        detail={
          <>
            Couldn't read machine token logs. See <Link to="/logs/m2m" className="font-medium underline">Machine tokens</Link>.
          </>
        }
      />
    );
  }
  return (
    <>
      <CheckRow
        state={first ? "done" : waiting}
        title="Service account recognised"
        detail={
          first
            ? `Client ID ${clientId} used at ${format(new Date(first.createdAt), "HH:mm")}`
            : polling
              ? "Waiting for a token request…"
              : "Run the command above"
        }
      />
      {issued ? (
        <CheckRow
          state="done"
          title="Result"
          detail={`Token issued at ${format(new Date(issued.createdAt), "HH:mm")}${
            issued.scopesGranted?.trim() ? ` with ${issued.scopesGranted.trim().split(/[\s,]+/).join(", ")}` : ""
          }`}
        />
      ) : denied ? (
        <CheckRow
          state="failed"
          title="Result"
          detail={`Token refused at ${format(new Date(denied.createdAt), "HH:mm")}${denied.pdpReason ? `: ${denied.pdpReason}` : ""}`}
        />
      ) : (
        <CheckRow state="pending" title="Result" detail="Issued or refused, with the reason" />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterAgentPage({ presetType }: { presetType?: AgentType } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [type, setType] = useState<AgentType>(() => toType(searchParams.get("type")) ?? presetType ?? "ai");
  const isService = type === "service";
  const [idp, setIdp] = useState<string | null>(null);
  const [name, setName] = useState(() => searchParams.get("name") ?? "");
  const [ownerEmail, setOwnerEmail] = useState(() => {
    const user = SessionManager.getSession()?.user as { email?: unknown } | undefined;
    return typeof user?.email === "string" ? user.email : "";
  });
  const [ownerTeam, setOwnerTeam] = useState("");
  const [description, setDescription] = useState("");
  const [runsOn, setRunsOn] = useState<RunsOn>("desktop");
  const [redirect, setRedirect] = useState(RUNS_ON[0].redirect);
  const [method, setMethod] = useState<Method>("secret");
  const [jwksUri, setJwksUri] = useState("");
  const [k8sNamespace, setK8sNamespace] = useState("");
  const [k8sServiceAccount, setK8sServiceAccount] = useState("");

  const [servers, setServers] = useState<ServerRoleSelection>(() => {
    const ids = (searchParams.get("mcp") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return Object.fromEntries(ids.map((id) => [id, ""]));
  });
  const [roles, setRoles] = useState<Record<string, RSRole | undefined>>({});
  const onRoleMeta = useCallback((serverId: string, role: RSRole | undefined) => {
    setRoles((prev) => (prev[serverId] === role ? prev : { ...prev, [serverId]: role }));
  }, []);

  const [agent, setAgent] = useState<RegisteredAgentCreds | null>(null);
  const [created, setCreated] = useState<CreatedServiceAccount | null>(null);
  // The service account and credential as soon as each exists, so a retry after
  // a later step fails reuses them instead of creating a second account.
  const partial = useRef<{ sa?: WorkspaceServiceAccount; clientId?: string; clientSecret?: string }>({});
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [testing, setTesting] = useState(false);
  const [testStarted, setTestStarted] = useState(false);

  const [registerAgent] = useRegisterAgentMutation();
  const [createSA] = useCreateWorkspaceServiceAccountMutation();
  const [provision] = useProvisionWorkloadCredentialMutation();
  const [grant] = useGrantWorkloadAccessMutation();
  const [createWorkload] = useCreateAppWorkloadMutation();

  const { data: allServers } = useListApplicationsQuery();
  const selectedServers = useMemo(() => (allServers ?? []).filter((s) => s.id in servers), [allServers, servers]);
  const missingRole = selectedServers.some((s) => !servers[s.id]);

  const registered = Boolean(agent || created);
  const listPath = presetType === "service" ? "/service-accounts" : "/agents";

  // "Agent recognised": the client shows up in the workspace registry.
  const { data: clients } = useListWorkspaceClientsQuery(undefined, {
    skip: !agent || !testStarted,
    pollingInterval: testing ? POLL_MS : 0,
  });
  const clientRows = useMemo(() => (clients ?? []).filter((c) => agent && c.client_id === agent.client_id), [clients, agent]);
  const lastToken = clientRows
    .map((c) => c.last_token_issued_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  // The operator stops the test ("Cancel test"); polling also stops after 10 minutes.
  useEffect(() => {
    if (!testing) return;
    const t = window.setTimeout(() => setTesting(false), 10 * 60_000);
    return () => window.clearTimeout(t);
  }, [testing]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim());
  const redirectValid = /^https?:\/\/[^/\s]+/.test(redirect.trim());
  const methodValid =
    method === "secret" ||
    (method === "jwks" && /^https:\/\/\S+/.test(jwksUri.trim())) ||
    (method === "kubernetes" && k8sNamespace.trim() !== "" && k8sServiceAccount.trim() !== "");
  const nameError = touched && !name.trim() ? "Enter a name." : null;
  const ownerError = touched && isService && !emailValid ? "Enter the owner's email." : null;
  const redirectError = touched && !isService && !redirectValid ? "Enter a full http(s) redirect URI." : null;
  const methodError = touched && isService && !methodValid ? "Fill in the sign-in method's fields." : null;

  const doRegisterAgent = async () => {
    const res = await registerAgent({ name: name.trim(), redirect_uris: [redirect.trim()] }).unwrap();
    setAgent({ client_id: res.client_id, client_secret: res.client_secret, issuer: res.issuer });
    rememberRegisteredAgent({
      client_id: res.client_id,
      name: name.trim(),
      redirect_uri: redirect.trim(),
      servers: selectedServers.map((s) => s.name),
      server_ids: selectedServers.map((s) => s.id),
      kind: type === "voice" ? "voice" : "ai",
      registered_at: new Date().toISOString(),
    });
    toast.success(`${type === "voice" ? "Voice agent" : "Agent"} registered.`);
  };

  const doCreateServiceAccount = async () => {
    // 1 · the service account (once — a retry after a failed grant reuses it)
    let sa = created?.sa ?? partial.current.sa;
    let clientId = created?.clientId ?? partial.current.clientId;
    let clientSecret = created?.clientSecret ?? partial.current.clientSecret;
    if (!sa) {
      sa = await createSA({
        name: name.trim(),
        owner_email: ownerEmail.trim(),
        ...(ownerTeam.trim() ? { owner_team: ownerTeam.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      }).unwrap();
      partial.current.sa = sa;
    }
    // 2 · its credential
    if (method !== "kubernetes" && !clientId) {
      const cred = await provision(
        method === "secret" ? { saId: sa.id, use_client_secret: true } : { saId: sa.id, jwks_uri: jwksUri.trim() },
      ).unwrap();
      clientId = cred.client_id;
      clientSecret = cred.client_secret;
      partial.current.clientId = clientId;
      partial.current.clientSecret = clientSecret;
    }
    // 3 · access on each MCP (skip ones already granted)
    const done = new Map((created?.grants ?? []).filter((g) => g.ok).map((g) => [g.serverId, g]));
    const grants: Grant[] = [];
    for (const s of selectedServers) {
      const prior = done.get(s.id);
      if (prior) {
        grants.push(prior);
        continue;
      }
      const roleId = servers[s.id];
      const roleName = roles[s.id]?.name ?? "";
      try {
        if (method === "kubernetes") {
          const res = await createWorkload({
            rsId: s.id,
            service_account_id: sa.id,
            role_id: roleId,
            platform: "kubernetes",
            selectors: { "k8s:ns": k8sNamespace.trim(), "k8s:sa": k8sServiceAccount.trim() },
          }).unwrap();
          grants.push({
            serverId: s.id,
            serverName: s.name,
            roleName: res.role_name || roleName,
            ok: true,
            installSnippet: res.install_snippet,
            spiffeId: res.spiffe_id,
            clientId: res.client_id,
          });
        } else {
          const res = await grant({ rsId: s.id, service_account_id: sa.id, role_id: roleId }).unwrap();
          grants.push({
            serverId: s.id,
            serverName: s.name,
            roleName: res.role_name || roleName,
            ok: true,
            resource: res.resource,
            scopes: res.effective_scopes,
          });
        }
      } catch (err) {
        grants.push({ serverId: s.id, serverName: s.name, roleName, ok: false, error: apiErrorMessage(err, "Couldn't give access.") });
      }
    }
    setCreated({
      sa,
      clientId: clientId ?? grants.find((g) => g.clientId)?.clientId,
      clientSecret,
      grants,
      createdAt: created?.createdAt ?? new Date().toISOString(),
    });
    if (grants.some((g) => !g.ok)) toast.error("Created, but access on some MCPs failed. See Grant MCP Access.");
    else toast.success("Service account created.");
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (!name.trim()) return;
    if (isService ? !emailValid || !methodValid : !redirectValid) return;
    if (missingRole) {
      setError("Pick a role on every ticked MCP, or untick it.");
      return;
    }
    setBusy(true);
    try {
      if (isService) await doCreateServiceAccount();
      else await doRegisterAgent();
    } catch (err) {
      setError(apiErrorMessage(err, isService ? "Couldn't create the service account." : "Couldn't register the agent."));
    } finally {
      setBusy(false);
    }
  };

  const failedGrants = created?.grants.filter((g) => !g.ok) ?? [];
  const firstGrant = created?.grants.find((g) => g.ok && g.resource);
  const saCurl =
    created?.clientId && method !== "kubernetes"
      ? (secret: string) =>
          method === "secret"
            ? `curl -X POST "${computeTokenURL()}" \\\n  -u "${created.clientId}:${secret}" \\\n  -d "grant_type=client_credentials" \\\n  -d "resource=${firstGrant?.resource ?? "<MCP resource URI>"}"`
            : `curl -X POST "${computeTokenURL()}" \\\n  -d "grant_type=client_credentials" \\\n  -d "client_id=${created.clientId}" \\\n  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \\\n  -d "client_assertion=<JWT signed with your private key>" \\\n  -d "resource=${firstGrant?.resource ?? "<MCP resource URI>"}"`
      : null;

  const serverNames = selectedServers.map((s) => s.name);
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === type)?.label ?? "Agent";
  const primaryLabel = isService ? (created ? "Retry access" : "Create service account") : "Register agent";

  const startTest = () => {
    setTestStarted(true);
    setTesting(true);
  };

  return (
    <ConsolePage
      crumbs={
        presetType === "service"
          ? [{ label: "Service accounts", to: "/service-accounts" }, { label: "Create" }]
          : [{ label: "Agents", to: "/agents" }, { label: "Register" }]
      }
      title={presetType === "service" && isService ? "Create service account" : "Register agent"}
      description="One page. Credentials appear when you register."
      actions={
        registered && failedGrants.length === 0 ? (
          <Button className="text-white" onClick={() => navigate(listPath)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => navigate(listPath)} disabled={busy}>
              Cancel
            </Button>
            <Button className="text-white" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? (isService ? "Creating…" : "Registering…") : primaryLabel}
            </Button>
          </>
        )
      }
    >
      {error ? <Notice tone="danger" title="Not registered.">{error}</Notice> : null}
      <SetupLayout
        side={
          <SidePanel
            title="How the agent signs in"
            items={[
              { term: "User signs in", body: "Through the workspace's identity provider, for example Okta." },
              { term: "Agent gets a token", body: "Scoped to that user and the MCPs selected here." },
              { term: "Never more than the user", body: "The agent can't exceed the user's own access." },
              { term: "Service accounts", body: "No user involved; the token is issued to the service itself." },
            ]}
          >
            <h3 className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">Using the credentials</h3>
            <DarkCode
              code={
                isService
                  ? `curl -X POST "${computeTokenURL()}" \\\n  -u "$CLIENT_ID:$CLIENT_SECRET" \\\n  -d "grant_type=client_credentials"`
                  : `AGENT_CLIENT_ID=…\nAGENT_CLIENT_SECRET=…\nAUTHSEC_ISSUER=…`
              }
            />
          </SidePanel>
        }
      >
        <SectionRow>
          <SectionCard n={1} title="Users">
            {isService ? (
              <FieldHelp>A service account signs in as itself. No user or identity provider is involved.</FieldHelp>
            ) : (
              <div className="space-y-1.5">
                <FieldLabel htmlFor="ag-idp">Identity provider</FieldLabel>
                <IdentityProviderPicker
                  id="ag-idp"
                  value={idp}
                  onChange={setIdp}
                  disabled={registered}
                  describedBy="ag-idp-help"
                />
                <FieldHelp id="ag-idp-help">
                  People sign in to this agent through this provider. The agent never gets more access than the user.
                </FieldHelp>
                {idp && idp !== AUTHSEC_DIRECTORY ? (
                  <FieldHelp>
                    AuthSec doesn't save this choice for an agent yet: people can sign in through any active provider in
                    the workspace.
                  </FieldHelp>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard n={2} title="Agent">
            <div className="space-y-1.5">
              <FieldLabel id="ag-type-label">Type</FieldLabel>
              <Segmented labelledBy="ag-type-label" value={type} onChange={setType} options={TYPE_OPTIONS} disabled={registered} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="ag-name" required>
                Name
              </FieldLabel>
              <Input
                id="ag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isService ? "ci-pipeline" : "support-assistant"}
                autoComplete="off"
                disabled={registered}
                aria-invalid={nameError ? true : undefined}
              />
              {nameError ? <FieldHelp error>{nameError}</FieldHelp> : null}
            </div>

            {isService ? (
              <>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="ag-owner" required>
                    Owner
                  </FieldLabel>
                  <Input
                    id="ag-owner"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="priya@acme.com"
                    autoComplete="off"
                    disabled={registered}
                    aria-invalid={ownerError ? true : undefined}
                  />
                  <FieldHelp error={Boolean(ownerError)}>
                    {ownerError ?? "The person responsible for what this account does."}
                  </FieldHelp>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="ag-team">Team</FieldLabel>
                    <Input id="ag-team" value={ownerTeam} onChange={(e) => setOwnerTeam(e.target.value)} placeholder="Optional" autoComplete="off" disabled={registered} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="ag-desc">Description</FieldLabel>
                    <Input id="ag-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" autoComplete="off" disabled={registered} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel id="ag-method-label">Sign-in method</FieldLabel>
                  <Segmented labelledBy="ag-method-label" value={method} onChange={setMethod} options={METHODS} disabled={registered} />
                </div>
                {method === "jwks" ? (
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="ag-jwks" required>
                      Public key URL (JWKS URI)
                    </FieldLabel>
                    <Input
                      id="ag-jwks"
                      value={jwksUri}
                      onChange={(e) => setJwksUri(e.target.value)}
                      placeholder="https://example.com/.well-known/jwks.json"
                      autoComplete="off"
                      className="font-mono"
                      disabled={registered}
                    />
                  </div>
                ) : method === "kubernetes" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="ag-ns" required>
                        Kubernetes namespace
                      </FieldLabel>
                      <Input id="ag-ns" className="font-mono" value={k8sNamespace} onChange={(e) => setK8sNamespace(e.target.value)} placeholder="payments" autoComplete="off" disabled={registered} />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="ag-k8ssa" required>
                        Kubernetes ServiceAccount
                      </FieldLabel>
                      <Input id="ag-k8ssa" className="font-mono" value={k8sServiceAccount} onChange={(e) => setK8sServiceAccount(e.target.value)} placeholder="payments-worker" autoComplete="off" disabled={registered} />
                    </div>
                  </div>
                ) : null}
                {methodError ? <FieldHelp error>{methodError}</FieldHelp> : null}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <FieldLabel id="ag-runs-label">Where it runs</FieldLabel>
                  <Segmented
                    labelledBy="ag-runs-label"
                    value={runsOn}
                    disabled={registered}
                    onChange={(v) => {
                      setRunsOn(v);
                      setRedirect(RUNS_ON.find((r) => r.value === v)?.redirect ?? "https://");
                    }}
                    options={RUNS_ON.map((r) => ({ value: r.value, label: r.label }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="ag-redirect" required>
                    Redirect URI
                  </FieldLabel>
                  <Input
                    id="ag-redirect"
                    value={redirect}
                    onChange={(e) => setRedirect(e.target.value)}
                    autoComplete="off"
                    className="font-mono"
                    disabled={registered}
                    aria-invalid={redirectError ? true : undefined}
                  />
                  <FieldHelp error={Boolean(redirectError)}>
                    {redirectError ??
                      `Where the person is sent back after signing in. ${RUNS_ON.find((r) => r.value === runsOn)?.hint ?? ""}`}
                  </FieldHelp>
                </div>
              </>
            )}
          </SectionCard>
        </SectionRow>

        <SectionCard n={3} title="Grant MCP Access">
          <ServerRolePicker value={servers} onChange={setServers} onRoleMeta={onRoleMeta} disabled={registered && failedGrants.length === 0} />
          {missingRole ? <FieldHelp error>Pick a role on every ticked MCP, or untick it.</FieldHelp> : null}
          {!isService ? (
            <FieldHelp>
              The agent's first call to each MCP asks for approval; the test below approves it with the role picked here,
              for the person signed in.
            </FieldHelp>
          ) : null}
          {created && created.grants.length > 0 ? (
            <CheckList>
              {created.grants.map((g) => (
                <CheckRow
                  key={g.serverId}
                  state={g.ok ? "done" : "failed"}
                  title={g.serverName}
                  detail={
                    g.ok
                      ? `${roleLabel(g.roleName)}${g.scopes && g.scopes.length > 0 ? ` · ${g.scopes.join(", ")}` : ""}`
                      : g.error
                  }
                />
              ))}
            </CheckList>
          ) : null}
        </SectionCard>

        <SectionCard n={4} title="SDK Integration" disabled={!registered}>
          {agent ? (
            <>
              <Segmented label="Language" value={language} onChange={setLanguage} options={LANGUAGES} />
              <div className="space-y-2">
                <CredentialRow label="Client ID" value={agent.client_id} />
                <CredentialRow label="Client secret" value={agent.client_secret} display={mask(agent.client_secret)} />
              </div>
              <DarkCode
                code={agentConfig(agent, agent.client_secret, serverNames, language)}
                display={agentConfig(agent, mask(agent.client_secret), serverNames, language)}
                label={`${typeLabel} configuration`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <CopyCodeButton code={agentConfig(agent, agent.client_secret, serverNames, language)} what="Code" />
                <span className="text-[length:13px] text-(--color-text-muted)">The secret is shown only once.</span>
              </div>
            </>
          ) : created ? (
            <>
              <div className="space-y-2">
                {created.clientId ? <CredentialRow label="Client ID" value={created.clientId} /> : null}
                {created.clientSecret ? (
                  <CredentialRow label="Client secret" value={created.clientSecret} display={mask(created.clientSecret)} />
                ) : null}
                {created.grants
                  .filter((g) => g.spiffeId)
                  .slice(0, 1)
                  .map((g) => (
                    <CredentialRow key="spiffe" label="SPIFFE ID" value={g.spiffeId!} />
                  ))}
              </div>
              {saCurl ? (
                <>
                  <DarkCode
                    code={saCurl(created.clientSecret ?? "$CLIENT_SECRET")}
                    display={saCurl(created.clientSecret ? mask(created.clientSecret) : "$CLIENT_SECRET")}
                    label="Get a token"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <CopyCodeButton code={saCurl(created.clientSecret ?? "$CLIENT_SECRET")} what="Command" />
                    {created.clientSecret ? (
                      <span className="text-[length:13px] text-(--color-text-muted)">The secret is shown only once.</span>
                    ) : null}
                  </div>
                </>
              ) : null}
              {method === "kubernetes"
                ? created.grants
                    .filter((g) => g.ok && g.installSnippet)
                    .map((g) => (
                      <div key={g.serverId} className="space-y-2">
                        <p className="text-[length:var(--font-size-sm)] font-medium text-(--color-text)">
                          Set up the pod for {g.serverName}
                        </p>
                        <DarkCode code={g.installSnippet!} />
                        <CopyCodeButton code={g.installSnippet!} what="Snippet" label="Copy snippet" />
                      </div>
                    ))
                : null}
              {method === "kubernetes" && created.grants.length === 0 ? (
                <FieldHelp>With Kubernetes, the pod's identity is set up per MCP. Grant an MCP to get its snippet.</FieldHelp>
              ) : null}
            </>
          ) : (
            <Waiting>Credentials appear here when you register. The secret is shown only once.</Waiting>
          )}
        </SectionCard>

        <SectionCard n={5} title="Test Integration" disabled={!registered}>
          {!registered ? (
            <Waiting>Register first. Then start your {isService ? "service" : "agent"} with the code above and run the test.</Waiting>
          ) : (
            <>
              <p className="text-[length:var(--font-size-sm)] text-(--color-text)">
                {isService
                  ? "Run the command above, then run the test. Each check updates as it happens."
                  : "Start your agent with the code above, sign in as a test user, then run the test. Each check updates as it happens."}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="text-white" onClick={startTest} disabled={testing}>
                  {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {testing ? "Testing…" : testStarted ? "Test again" : "Test Integration"}
                </Button>
                {testing ? (
                  <Button variant="ghost" onClick={() => setTesting(false)}>
                    Cancel test
                  </Button>
                ) : null}
              </div>
              {testStarted ? (
                agent ? (
                  <CheckList>
                    <CheckRow
                      state={clientRows.length > 0 ? "done" : testing ? "running" : "pending"}
                      title={`${typeLabel} recognised`}
                      detail={
                        lastToken
                          ? `Client ID ${agent.client_id} used at ${format(new Date(lastToken), "HH:mm")}`
                          : clientRows.length > 0
                            ? `Client ID ${agent.client_id} seen by ${clientRows.map((c) => c.resource_server_name).filter(Boolean).join(", ")}`
                            : `Waiting for client ID ${agent.client_id}…`
                      }
                    />
                    {selectedServers.length > 0 ? (
                      selectedServers.map((s) => (
                        <AgentServerChecks
                          key={s.id}
                          serverId={s.id}
                          serverName={s.name}
                          clientId={agent.client_id}
                          role={roles[s.id]}
                          polling={testing}
                        />
                      ))
                    ) : (
                      <CheckRow
                        state="pending"
                        title="Tool request"
                        detail="No MCP was selected in Grant MCP Access, so there is no tool request to watch."
                      />
                    )}
                  </CheckList>
                ) : created?.clientId && created.grants.some((g) => g.ok) ? (
                  <CheckList>
                    <ServiceAccountChecks clientId={created.clientId} since={created.createdAt} polling={testing} />
                  </CheckList>
                ) : (
                  <FieldHelp>
                    {created?.clientId
                      ? "Grant access to at least one MCP first; a token is only issued for an MCP."
                      : "Kubernetes identities don't request tokens with a client ID; check the pod's logs."}
                  </FieldHelp>
                )
              ) : null}
            </>
          )}
        </SectionCard>
      </SetupLayout>
    </ConsolePage>
  );
}
