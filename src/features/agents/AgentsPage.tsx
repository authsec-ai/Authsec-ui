/**
 * `AgentsPage` — workspace home for AI agents (cross-app / XAA actors).
 *
 * An "agent" is a confidential OAuth client (client_kind="agent") that logs a
 * USER in and acts on their behalf, reaching MCP servers via the ID-JAG flow
 * (OIDC login → token-exchange → jwt-bearer). It is a different entity from a
 * Service Account (a machine principal with no user) — see /service-accounts.
 *
 * There is no dedicated agent-list endpoint yet, so the inventory is derived by
 * filtering the workspace client registry to client_kind="agent". An agent
 * surfaces here once it has connected to at least one MCP server. The register
 * action mints the confidential client (POST /authsec/agents).
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Ban, Bot, ClipboardCopy, ExternalLink, Plus } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListWorkspaceClientsQuery,
  useRevokeWorkspaceClientMutation,
} from "@/app/api/mcpClientsApi";
import { useRegisterAgentMutation } from "@/app/api/agentIdentityApi";
import type { WorkspaceClientItem } from "@/app/api/mcpClientsApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar, ConsoleRowActions, EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { ConsolePage } from "@/components/console/ConsolePage";

const DOCS_URL = "https://docs.authsec.dev/getting-started";

// ── Register agent wizard ─────────────────────────────────────────────────────
// Mints a confidential agent client (authorization_code + token-exchange +
// secret) in THIS workspace. The agent uses it to log a user in and reach MCP
// servers via the cross-app (ID-JAG) flow.
function RegisterAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [redirect, setRedirect] = useState("http://localhost:8126/callback");
  const [register, { isLoading }] = useRegisterAgentMutation();
  const [result, setResult] = useState<{
    client_id: string;
    client_secret: string;
    issuer: string;
  } | null>(null);

  const reset = () => {
    setName("");
    setRedirect("http://localhost:8126/callback");
    setResult(null);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      const res = await register({
        name: name.trim(),
        redirect_uris: [redirect.trim()],
      }).unwrap();
      setResult({
        client_id: res.client_id,
        client_secret: res.client_secret,
        issuer: res.issuer,
      });
      toast.success("Agent registered.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't register agent.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register AI agent</DialogTitle>
          <DialogDescription>
            Creates a confidential client that logs a user in and calls MCP servers on their
            behalf (cross-app / ID-JAG). Use these values in the agent's config.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-emerald-700">
              Agent registered — copy the secret now, it won't be shown again.
            </p>
            {(
              [
                ["AGENT_CLIENT_ID", result.client_id],
                ["AGENT_CLIENT_SECRET", result.client_secret],
                ["AUTHSEC_ISSUER", result.issuer],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                    {val}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(val);
                      toast.success("Copied");
                    }}
                  >
                    <ClipboardCopy className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
              <span className="font-medium text-slate-700">What happens next:</span> the agent logs
              a user in (OIDC), exchanges that for an ID-JAG, then redeems it for a scoped token at
              each MCP server. Its first call to a server appears as a pending request on that
              server's <span className="font-medium">Connections</span> tab — approve it there with
              a role.{" "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-blue-700 hover:underline"
              >
                Agent guide <ExternalLink className="size-3" />
              </a>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ag-name">Name</Label>
              <Input
                id="ag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="research-agent"
                autoComplete="off"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-redirect">Redirect URI</Label>
              <Input
                id="ag-redirect"
                value={redirect}
                onChange={(e) => setRedirect(e.target.value)}
                autoComplete="off"
                className="h-9 font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Where the user is sent back after login. Default matches the sample agent's
                loopback callback.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={!name.trim() || isLoading}
                className="text-white"
              >
                {isLoading ? "Registering…" : "Register agent"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "outline" | "secondary" }> =
  {
    approved: { label: "Connected", variant: "default" },
    pending_approval: { label: "Pending approval", variant: "secondary" },
    revoked: { label: "Revoked", variant: "outline" },
  };

// Revoke an agent's connection to a server. Backed by the connections DELETE
// endpoint; the workspace-clients list invalidates on success so the row clears.
function RevokeAgentDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: WorkspaceClientItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [revoke, { isLoading }] = useRevokeWorkspaceClientMutation();

  const submit = async () => {
    if (!agent) return;
    try {
      await revoke({ rsId: agent.resource_server_id, clientId: agent.client_id }).unwrap();
      toast.success("Connection revoked.");
      onOpenChange(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't revoke connection.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke agent connection?</DialogTitle>
          <DialogDescription>
            This stops <span className="font-medium text-foreground">{agent?.client_name}</span> from
            minting new tokens for{" "}
            <span className="font-medium text-foreground">{agent?.resource_server_name}</span>.
            Existing tokens expire at their normal lifetime.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={isLoading}>
            <Ban className="mr-1.5 size-3.5" />
            {isLoading ? "Revoking…" : "Revoke connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const { data, isLoading } = useListWorkspaceClientsQuery();
  const [query, setQuery] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<WorkspaceClientItem | null>(null);

  const agents = useMemo(() => {
    let items = (data ?? []).filter((c) => c.client_kind === "agent");
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter((c) =>
        [c.client_name, c.client_id, c.resource_server_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return items;
  }, [data, query]);

  const columns = useMemo<AdaptiveColumn<WorkspaceClientItem>[]>(
    () => [
      {
        id: "name",
        header: "Agent",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell label={row.original.client_name} detail={row.original.client_id} />
        ),
      },
      {
        id: "connected_to",
        header: "Connected to",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) =>
          row.original.resource_server_name ? (
            <span className="text-xs text-slate-700">{row.original.resource_server_name}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => {
          const s = STATUS_BADGE[row.original.status] ?? {
            label: row.original.status,
            variant: "outline" as const,
          };
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        id: "last_token",
        header: "Last token",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => {
          const ts = row.original.last_token_issued_at
            ? new Date(row.original.last_token_issued_at)
            : null;
          const valid = ts && !Number.isNaN(ts.getTime());
          return (
            <span className="text-xs text-muted-foreground">
              {valid ? formatDistanceToNow(ts, { addSuffix: true }) : "never"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const canRevoke =
            row.original.status !== "revoked" && !!row.original.resource_server_id;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  {
                    label: "Copy client ID",
                    icon: <ClipboardCopy className="size-4" />,
                    onSelect: () => {
                      void navigator.clipboard.writeText(row.original.client_id);
                      toast.success("Client ID copied");
                    },
                  },
                  {
                    label: "Revoke connection",
                    icon: <Ban className="size-4" />,
                    destructive: true,
                    disabled: !canRevoke,
                    onSelect: () => setRevokeTarget(row.original),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Agents"
      description="AI agents that act on behalf of a logged-in user. Each is a confidential client that signs a user in, then reaches MCP servers via cross-app delegation (ID-JAG). An agent appears below once it connects to its first server."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 size-3.5" />
              Docs
            </a>
          </Button>
          <Button onClick={() => setRegisterOpen(true)} className="text-white">
            <Plus className="mr-1.5 size-3.5" />
            Register agent
          </Button>
        </>
      }
    >
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by agent name, client ID, or server"
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading agents…</div>
          ) : agents.length === 0 ? (
            <div className="py-16 text-center">
              <Bot className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {query ? "No agents match this search." : "No agents yet"}
              </p>
              {!query && (
                <>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Register an agent to get its client credentials, then point your agent at them.
                    It shows up here after its first connection to an MCP server.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button size="sm" onClick={() => setRegisterOpen(true)} className="text-white">
                      <Plus className="mr-1.5 size-3.5" />
                      Register agent
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="agents-inventory"
              data={agents}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(c) => `${c.client_id}:${c.resource_server_id}`}
              pagination={{ pageSize: 15, pageSizeOptions: [15, 30, 50], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <RegisterAgentDialog open={registerOpen} onOpenChange={setRegisterOpen} />

      <RevokeAgentDialog
        agent={revokeTarget}
        open={!!revokeTarget}
        onOpenChange={(v) => !v && setRevokeTarget(null)}
      />
    </ConsolePage>
  );
}
