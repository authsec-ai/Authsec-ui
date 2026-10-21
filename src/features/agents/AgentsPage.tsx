/**
 * `AgentsPage` — /agents. One list of everything that calls your MCP servers:
 * AI agents, voice agents, service accounts and other OAuth clients.
 *
 * Sources (no rows are made up):
 *   - GET /authsec/clients (workspace client registry, one row per client per
 *     MCP server). client_kind "agent" → AI agent; a client whose ID is a
 *     service account's OAuth client folds into that service account; every
 *     other kind → Other client. Pending registrations come from here too.
 *   - GET /authsec/uflow/admin/service-accounts → Service accounts, with their
 *     MCP access from /service-accounts/:id/access.
 *   - Agents registered from this browser that no server has seen yet
 *     (registeredAgents.ts) → "Waiting for first connection". That record is
 *     also the only place a voice agent is told apart from an AI agent: the
 *     registry has no voice kind.
 *
 * A row that needs a decision carries one button (Approve or Test
 * Integration). Everything else — revoke, deny, edit, rotate, delete, copy —
 * is in the drawer a row click opens. There are no row menus.
 */

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Check, Loader2, Plus, X } from "lucide-react";

import { useListWorkspaceClientsQuery, type WorkspaceClientItem } from "@/app/api/mcpClientsApi";
import {
  useListServiceAccountAccessQuery,
  useListWorkspaceServiceAccountsQuery,
  type WorkspaceServiceAccount,
} from "@/app/api/agentIdentityApi";
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar, EntityCell, type ConsoleFilterOption } from "@/components/console/iam-console";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { DetailRow, DrawerSection } from "@/components/console/detail";
import { TableCard } from "@/theme/components/cards";
import { ConsolePage } from "@/components/console/ConsolePage";
import { cn } from "@/lib/utils";

import { ClientDrawer } from "@/features/clients/ClientDrawer";
import {
  CONNECTION_STATUS,
  SMALL_TEXT,
  clientStatus,
  latestToken,
  relativeOrNever,
  useApproveClient,
} from "@/features/clients/clientStatus";
import { ServiceAccountDetail, ServiceAccountReach } from "@/features/service-accounts/components/ServiceAccountDetail";
import {
  AUTH_METHOD_LABEL,
  SA_STATUS,
  authMethodOf,
  saStatusOf,
} from "@/features/service-accounts/components/serviceAccountStatus";

import { forgetRegisteredAgent, readRegisteredAgents, type RegisteredAgent } from "./registeredAgents";

// ── Row model ─────────────────────────────────────────────────────────────────

type AgentType = "ai" | "voice" | "service" | "other";
type TypeFilter = "all" | AgentType;

const TYPE_LABEL: Record<AgentType, string> = {
  ai: "AI agent",
  voice: "Voice agent",
  service: "Service account",
  other: "Other client",
};

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI agents" },
  { key: "voice", label: "Voice agents" },
  { key: "service", label: "Service accounts" },
  { key: "other", label: "Other clients" },
];

interface RowStatus {
  label: string;
  tone: ConsoleTone;
  /** Needs a decision: sorts first. */
  pending?: boolean;
  /** Never connected: offers Test Integration. */
  waiting?: boolean;
  /** Revoked or disabled: sorts last. */
  inactive?: boolean;
}

interface ClientRow {
  kind: "client";
  key: string;
  type: Exclude<AgentType, "service">;
  name: string;
  clientId: string;
  /** One registry row per MCP server; empty for a not-yet-seen agent. */
  connections: WorkspaceClientItem[];
  /** Registered from this browser. */
  local?: RegisteredAgent;
  status: RowStatus;
  lastUsed?: string;
}

interface ServiceRow {
  kind: "service";
  key: string;
  type: "service";
  name: string;
  sa: WorkspaceServiceAccount;
  status: RowStatus;
  lastUsed?: string;
}

type AgentRow = ClientRow | ServiceRow;

function clientRowStatus(conns: WorkspaceClientItem[]): RowStatus {
  if (conns.length === 0) return { ...CONNECTION_STATUS.waiting, waiting: true };
  const s = clientStatus(conns);
  return {
    ...CONNECTION_STATUS[s],
    pending: s === "pending",
    waiting: s === "waiting",
    inactive: s === "revoked",
  };
}

function saRowStatus(sa: WorkspaceServiceAccount): RowStatus {
  const s = saStatusOf(sa);
  return { ...SA_STATUS[s], waiting: s === "waiting", inactive: s === "disabled" };
}

const isFilter = (v: string | null): v is TypeFilter =>
  v === "all" || v === "ai" || v === "voice" || v === "service" || v === "other";

// ── Row action: one button, only when there is something to do ─────────────────

function testLink(rsId: string) {
  return `/applications/${encodeURIComponent(rsId)}/test`;
}

function TestIntegrationLink({ rsId }: { rsId: string }) {
  return (
    <Button size="sm" variant="outline" asChild onClick={(e) => e.stopPropagation()}>
      <Link to={testLink(rsId)}>Test Integration</Link>
    </Button>
  );
}

/** A never-connected service account: test against the first server it was granted. */
function ServiceTestAction({ saId }: { saId: string }) {
  const { data } = useListServiceAccountAccessQuery(saId);
  const rsId = data?.items[0]?.resource_server_id;
  return rsId ? <TestIntegrationLink rsId={rsId} /> : null;
}

function ApproveAction({ row, onOpen }: { row: ClientRow; onOpen: () => void }) {
  const [approve, { isLoading }] = useApproveClient();
  const pending = row.connections.filter((c) => c.status === "pending_approval");
  return (
    <Button
      size="sm"
      className="text-white"
      disabled={isLoading}
      onClick={(e) => {
        e.stopPropagation();
        // One pending server: approve it here. Several: pick in the drawer.
        if (pending.length === 1) void approve(pending[0]);
        else onOpen();
      }}
    >
      {isLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />}
      Approve
    </Button>
  );
}

function RowAction({
  row,
  serverIdByName,
  onOpen,
}: {
  row: AgentRow;
  serverIdByName: Map<string, string>;
  onOpen: () => void;
}) {
  if (row.kind === "service") {
    return row.status.waiting ? <ServiceTestAction saId={row.sa.id} /> : null;
  }
  if (row.status.pending) return <ApproveAction row={row} onOpen={onOpen} />;
  if (!row.status.waiting) return null;
  const approved = row.connections.find((c) => c.status === "approved");
  const rsId =
    approved?.resource_server_id ??
    row.local?.server_ids?.[0] ??
    row.local?.servers.map((n) => serverIdByName.get(n)).find(Boolean);
  return rsId ? <TestIntegrationLink rsId={rsId} /> : null;
}

// ── Cells ───────────────────────────────────────────────────────────────────────

const dash = <span className="text-sm text-muted-foreground">–</span>;

function ClientReach({ row }: { row: ClientRow }) {
  const reach = row.connections.filter((c) => c.status === "approved").map((c) => c.resource_server_name);
  const pending = row.connections
    .filter((c) => c.status === "pending_approval")
    .map((c) => c.resource_server_name);
  if (!reach.length && !pending.length) {
    return row.local?.servers.length ? (
      <span className="text-sm text-foreground">{row.local.servers.join(", ")}</span>
    ) : (
      dash
    );
  }
  return (
    <span className="text-sm text-foreground">
      {reach.join(", ")}
      {pending.length ? (
        <span className="text-muted-foreground">
          {reach.length ? ", " : ""}
          {pending.join(", ")} (pending)
        </span>
      ) : null}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const clientsQ = useListWorkspaceClientsQuery();
  const saQ = useListWorkspaceServiceAccountsQuery();
  const { data: servers } = useListResourceServersQuery();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);

  const rawType = params.get("type");
  const typeFilter: TypeFilter = isFilter(rawType) ? rawType : "all";
  const setTypeFilter = (next: TypeFilter) => {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("type");
    else p.set("type", next);
    setParams(p, { replace: true });
  };

  const serverIdByName = useMemo(
    () => new Map((servers ?? []).map((s) => [s.name, s.id] as const)),
    [servers],
  );

  const allRows = useMemo<AgentRow[]>(() => {
    // localVersion re-reads browser storage after "Remove from this list".
    void localVersion;
    const local = readRegisteredAgents();
    const localById = new Map(local.map((a) => [a.client_id, a] as const));
    const sas = saQ.data ?? [];
    const saClientIds = new Set(sas.map((sa) => sa.oauth_client_id).filter((v): v is string => !!v));

    const byClient = new Map<string, WorkspaceClientItem[]>();
    for (const c of clientsQ.data ?? []) {
      // A service account's own OAuth client is that service account's row.
      if (saClientIds.has(c.client_id)) continue;
      const list = byClient.get(c.client_id);
      if (list) list.push(c);
      else byClient.set(c.client_id, [c]);
    }

    const clientRows: ClientRow[] = Array.from(byClient.entries()).map(([clientId, conns]) => {
      const mine = localById.get(clientId);
      const type: ClientRow["type"] =
        conns[0].client_kind === "agent" ? (mine?.kind === "voice" ? "voice" : "ai") : "other";
      return {
        kind: "client",
        key: `client:${clientId}`,
        type,
        name: conns[0].client_name || conns[0].software_id || clientId,
        clientId,
        connections: conns,
        local: mine,
        status: clientRowStatus(conns),
        lastUsed: latestToken(conns),
      };
    });

    // Registered here, not yet listed by the registry. Only once the registry
    // has answered, so a loading list doesn't flash them as unseen.
    const unseen: ClientRow[] = clientsQ.data
      ? local
          .filter((a) => !byClient.has(a.client_id) && !saClientIds.has(a.client_id))
          .map((a) => ({
            kind: "client",
            key: `client:${a.client_id}`,
            type: a.kind === "voice" ? "voice" : "ai",
            name: a.name,
            clientId: a.client_id,
            connections: [],
            local: a,
            status: clientRowStatus([]),
          }))
      : [];

    const serviceRows: ServiceRow[] = sas.map((sa) => ({
      kind: "service",
      key: `sa:${sa.id}`,
      type: "service",
      name: sa.name,
      sa,
      status: saRowStatus(sa),
      lastUsed: sa.last_seen_at,
    }));

    const rank = (r: AgentRow) => (r.status.pending ? 0 : r.status.inactive ? 2 : 1);
    return [...unseen, ...clientRows, ...serviceRows].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }, [clientsQ.data, saQ.data, localVersion]);

  const counts = useMemo(() => {
    const c: Record<TypeFilter, number> = { all: allRows.length, ai: 0, voice: 0, service: 0, other: 0 };
    for (const r of allRows) c[r.type] += 1;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!q) return true;
      const hay =
        r.kind === "service"
          ? [r.name, r.sa.description, r.sa.oauth_client_id, r.sa.spiffe_id, r.sa.owner_email]
          : [r.name, r.clientId, ...r.connections.map((c) => c.resource_server_name), ...(r.local?.servers ?? [])];
      return hay.filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [allRows, query, typeFilter]);

  const filters = useMemo<ConsoleFilterOption[]>(
    () => FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] })),
    [counts],
  );

  const columns = useMemo<AdaptiveColumn<AgentRow>[]>(
    () => [
      {
        id: "name",
        header: "Agent",
        alwaysVisible: true,
        primary: true,
        approxWidth: 220,
        cell: ({ row }) => <EntityCell label={<span className="font-semibold">{row.original.name}</span>} />,
      },
      {
        id: "type",
        header: "Type",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => <span className="text-sm text-foreground">{TYPE_LABEL[row.original.type]}</span>,
      },
      {
        id: "idp",
        header: "Identity provider",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) => {
          const r = row.original;
          // Only a service account's credential type is known; the registry
          // doesn't say which IdP signs an agent's users in.
          if (r.kind !== "service") return dash;
          const method = authMethodOf(r.sa);
          return method === "none" ? dash : <span className="text-sm text-foreground">{AUTH_METHOD_LABEL[method]}</span>;
        },
      },
      {
        id: "access",
        header: "MCP access",
        priority: 1,
        approxWidth: 220,
        cell: ({ row }) =>
          row.original.kind === "service" ? (
            <ServiceAccountReach saId={row.original.sa.id} />
          ) : (
            <ClientReach row={row.original} />
          ),
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 230,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status.tone} className={SMALL_TEXT}>
            {row.original.status.label}
          </StatusBadge>
        ),
      },
      {
        id: "last_used",
        header: "Last used",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.status.pending && !row.original.lastUsed ? "–" : relativeOrNever(row.original.lastUsed)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 150,
        cell: ({ row }) => (
          <RowAction
            row={row.original}
            serverIdByName={serverIdByName}
            onOpen={() => setSelectedKey(row.original.key)}
          />
        ),
      },
    ],
    [serverIdByName],
  );

  const selected = selectedKey ? allRows.find((r) => r.key === selectedKey) ?? null : null;
  const isLoading = clientsQ.isLoading || saQ.isLoading;
  const failed = [clientsQ.isError && "clients and agents", saQ.isError && "service accounts"].filter(Boolean);
  const filtered = !!query || typeFilter !== "all";

  return (
    <ConsolePage
      title="Agents"
      description="AI agents, voice agents and service accounts that call your MCPs."
      actions={
        <Button asChild className="text-white">
          <Link to="/agents/new">
            <Plus className="mr-1.5 size-3.5" />
            Register agent
          </Link>
        </Button>
      }
    >
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search"
        filters={filters}
        activeFilter={typeFilter}
        onFilterChange={(v) => setTypeFilter(isFilter(v) ? v : "all")}
      />

      {failed.length ? (
        <p role="alert" className={cn("text-(--color-danger-text)", SMALL_TEXT)}>
          Couldn't load {failed.join(" or ")}. The list below leaves them out.
        </p>
      ) : null}

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading agents…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Bot className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                {filtered ? "Nothing matches this filter." : "No agents yet"}
              </p>
              {filtered ? (
                <button
                  type="button"
                  className={cn("mt-3 font-semibold text-(--color-primary-text) hover:underline", SMALL_TEXT)}
                  onClick={() => {
                    setQuery("");
                    setTypeFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <>
                  <p className={cn("mx-auto mt-1 max-w-md text-muted-foreground", SMALL_TEXT)}>
                    Register an agent to get its credentials and pick the MCP servers it can call.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button size="sm" asChild className="text-white">
                      <Link to="/agents/new">
                        <Plus className="mr-1.5 size-3.5" />
                        Register agent
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="agents-all"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.key}
              onRowClick={(r) => setSelectedKey(r.key)}
              pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {selected?.kind === "client" ? (
        <ClientDrawer
          open
          onClose={() => setSelectedKey(null)}
          name={selected.name}
          clientId={selected.clientId}
          connections={selected.connections}
          subtitle={
            selected.type === "other"
              ? "Other client · registered through OAuth"
              : `${TYPE_LABEL[selected.type]} · acts for a signed-in person`
          }
          emptyDescription={
            selected.local?.servers.length
              ? `Set up for ${selected.local.servers.join(", ")}. Its first call to each server asks for your approval on that server's Connections tab.`
              : undefined
          }
          identityExtra={
            selected.local ? (
              <DetailRow label="Redirect URI" value={selected.local.redirect_uri} mono full />
            ) : null
          }
        >
          {selected.type === "voice" ? (
            <DrawerSection label="Voice approvals">
              <p className={cn("text-muted-foreground", SMALL_TEXT)}>
                Voice agent sign-ins are approved on a device registered with the AuthSec mobile app.
              </p>
              <Button size="sm" variant="outline" className="mt-2" asChild>
                <Link to="/admin/voice-agent">Manage voice devices</Link>
              </Button>
            </DrawerSection>
          ) : null}
          {selected.local && selected.connections.length === 0 ? (
            <DrawerSection label="Listed from this browser">
              <p className={cn("text-muted-foreground", SMALL_TEXT)}>
                AuthSec lists an agent once it reaches an MCP server. Until then it shows here only in the
                browser that registered it.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  forgetRegisteredAgent(selected.clientId);
                  setLocalVersion((v) => v + 1);
                  setSelectedKey(null);
                }}
              >
                <X className="mr-1.5 size-3.5" /> Remove from this list
              </Button>
            </DrawerSection>
          ) : null}
        </ClientDrawer>
      ) : null}

      <ServiceAccountDetail
        sa={selected?.kind === "service" ? selected.sa : null}
        onClose={() => setSelectedKey(null)}
        onChanged={() => void saQ.refetch()}
      />
    </ConsolePage>
  );
}
