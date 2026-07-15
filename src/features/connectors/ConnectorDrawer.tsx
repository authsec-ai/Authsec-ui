import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { Copy, ExternalLink, KeyRound, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerHeader,
  DrawerBody,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
  DrawerEmpty,
  DrawerFooter,
} from "@/components/console/detail";
import { cn } from "@/lib/utils";
import {
  useGetConnectorQuery,
  useListConnectorProvidersQuery,
  useUpdateConnectorMutation,
  useDeleteConnectorMutation,
  useStartConnectorOAuthMutation,
  useListConnectorAssignmentsQuery,
  useCreateConnectorAssignmentMutation,
  useDeleteConnectorAssignmentMutation,
  useGetConnectorAuditQuery,
} from "@/app/api/connectorsApi";
import { ConnectorBadge } from "./ConnectorBadge";
import { ProviderAppForm } from "./ProviderAppForm";
import { providerMeta, getWorkspaceId } from "./providerMeta";
import { deriveConnectionHealth, HEALTH_LABEL, type ConnectionHealth } from "./connectionHealth";

const HEALTH_STYLE: Record<ConnectionHealth, string> = {
  connected: "bg-(--color-success-soft) text-(--color-success-text)",
  expiring: "bg-(--color-warning-soft) text-(--color-warning-text)",
  error: "bg-(--color-danger-soft) text-(--color-danger-text)",
  expired: "bg-(--color-danger-soft) text-(--color-danger-text)",
  not_connected: "bg-muted text-muted-foreground",
};

function HealthPill({ health }: { health: ConnectionHealth }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        HEALTH_STYLE[health],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group relative rounded-md bg-muted px-3 py-2.5">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">
        {code}
      </pre>
      <button
        type="button"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          toast.success("Copied");
        }}
        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <Copy className="size-3" />
      </button>
    </div>
  );
}

const ALL_ACTIONS = "__all__";

export function ConnectorDrawer({
  connectorId,
  onClose,
  onDeleted,
}: {
  connectorId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newActionKey, setNewActionKey] = useState(ALL_ACTIONS);
  const [newConstraints, setNewConstraints] = useState("");

  const { data, isLoading } = useGetConnectorQuery(connectorId ?? "", { skip: !connectorId });
  const { data: providers } = useListConnectorProvidersQuery();
  const { data: assignments, isLoading: assignmentsLoading } = useListConnectorAssignmentsQuery(
    connectorId ?? "",
    { skip: !connectorId },
  );
  const { data: auditRows, isLoading: auditLoading } = useGetConnectorAuditQuery(
    { connectorId: connectorId ?? "" },
    { skip: !connectorId || tab !== "activity" },
  );
  const [showAppForm, setShowAppForm] = useState(false);

  const [updateConnector] = useUpdateConnectorMutation();
  const [deleteConnector, { isLoading: deleting }] = useDeleteConnectorMutation();
  const [startOAuth, { isLoading: reconnecting }] = useStartConnectorOAuthMutation();
  const [createAssignment, { isLoading: granting }] = useCreateConnectorAssignmentMutation();
  const [deleteAssignment] = useDeleteConnectorAssignmentMutation();

  const open = !!connectorId;
  const connector = data?.connector;
  const connections = data?.connections ?? [];
  const provider = providers?.find((p) => p.key === connector?.provider_key) ?? null;
  const meta = connector ? providerMeta(connector.provider_key) : null;
  const { label: health, connection } = deriveConnectionHealth(connections);

  const handleClose = () => {
    setTab("overview");
    setConfirmDeleteOpen(false);
    setNewClientId("");
    setNewActionKey(ALL_ACTIONS);
    setNewConstraints("");
    setShowAppForm(false);
    onClose();
  };

  const handleToggle = (field: "enabled" | "agent_accessible", value: boolean) => {
    if (!connector) return;
    void updateConnector({ id: connector.id, [field]: value }).unwrap().catch(() => {
      toast.error("Couldn't update connector.");
    });
  };

  const handleReconnect = async () => {
    if (!connector) return;
    const scopes = connection?.scopes_granted?.length
      ? connection.scopes_granted
      : provider?.oauth_default_scopes ?? [];
    try {
      const { authorize_url } = await startOAuth({
        connectorId: connector.id,
        scopes,
        redirect_after: window.location.href,
      }).unwrap();
      window.location.href = authorize_url;
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't start the connection.");
    }
  };

  const handleDelete = async () => {
    if (!connector) return;
    try {
      await deleteConnector(connector.id).unwrap();
      toast.success("Connector deleted.");
      setConfirmDeleteOpen(false);
      handleClose();
      onDeleted();
    } catch {
      toast.error("Couldn't delete connector.");
    }
  };

  const handleGrant = async () => {
    if (!connector) return;
    if (!newClientId.trim()) {
      toast.error("Client ID is required.");
      return;
    }
    let constraints: Record<string, unknown> | undefined;
    if (newConstraints.trim()) {
      try {
        constraints = JSON.parse(newConstraints);
      } catch {
        toast.error("Input constraints must be valid JSON.");
        return;
      }
    }
    try {
      await createAssignment({
        connectorId: connector.id,
        client_id: newClientId.trim(),
        action_key: newActionKey === ALL_ACTIONS ? undefined : newActionKey,
        ...(constraints ? { input_constraints: constraints } : {}),
      }).unwrap();
      toast.success("Access granted.");
      setNewClientId("");
      setNewActionKey(ALL_ACTIONS);
      setNewConstraints("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't grant access.");
    }
  };

  const handleRevoke = async (assignmentId: string) => {
    if (!connector) return;
    try {
      await deleteAssignment({ connectorId: connector.id, assignmentId }).unwrap();
      toast.success("Access revoked.");
    } catch {
      toast.error("Couldn't revoke access.");
    }
  };

  const workspaceId = getWorkspaceId();
  const firstAction = meta?.actions[0];

  return (
    <>
      <RightDrawer
        open={open}
        onClose={handleClose}
        width={560}
        ariaTitle={connector?.name ?? "Connector"}
        ariaDescription="Connector details, access, actions, and usage."
      >
        {isLoading || !connector ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <>
            <DrawerHeader
              title={
                <span className="flex items-center gap-2.5">
                  <ConnectorBadge providerKey={connector.provider_key} size="size-7" />
                  {connector.name}
                </span>
              }
              subtitle={`${provider?.display_name ?? connector.provider_key} · created ${formatDistanceToNow(
                new Date(connector.created_at),
                { addSuffix: true },
              )}`}
            />

            <Tabs
              value={tab}
              onValueChange={setTab}
              className="flex flex-1 flex-col gap-0 overflow-hidden"
            >
              <div className="border-b px-6 pt-3">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="use">Use</TabsTrigger>
                </TabsList>
              </div>

              <DrawerBody>
                <TabsContent value="overview" className="space-y-6">
                  <DrawerSection label="Settings">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                        <p className="text-[13px] font-medium text-foreground">Enabled</p>
                        <Switch
                          checked={connector.enabled}
                          onCheckedChange={(v) => handleToggle("enabled", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                        <div>
                          <p className="text-[13px] font-medium text-foreground">Agent access</p>
                          <p className="text-[11px] text-muted-foreground">
                            Non-interactive callers (agents, MCP clients) may execute actions.
                          </p>
                        </div>
                        <Switch
                          checked={connector.agent_accessible}
                          onCheckedChange={(v) => handleToggle("agent_accessible", v)}
                        />
                      </div>
                    </div>
                  </DrawerSection>

                  <DrawerSection label="Connection">
                    <div className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[13px] font-medium text-foreground">
                          {connection?.binding_type === "user" ? "User connection" : "Workspace connection"}
                        </p>
                        <HealthPill health={health} />
                      </div>

                      {connection ? (
                        <>
                          <DetailGrid>
                            <DetailRow
                              label="Method"
                              value={
                                connection.auth_method === "oauth2"
                                  ? "OAuth 2.0"
                                  : connection.auth_method === "github_app"
                                    ? "GitHub App"
                                    : "API key"
                              }
                            />
                            {(connection.external_org_name || connection.external_account_name) && (
                              <DetailRow
                                label="Account"
                                value={
                                  connection.external_org_name
                                    ? `${connection.external_org_name}${connection.external_account_name ? ` · ${connection.external_account_name}` : ""}`
                                    : (connection.external_account_name ?? "")
                                }
                              />
                            )}
                            {connection.connected_by && (
                              <DetailRow label="Connected by" value={connection.connected_by} />
                            )}
                            <DetailRow
                              label="Expires"
                              value={
                                connection.access_expires_at
                                  ? formatDistanceToNow(new Date(connection.access_expires_at), {
                                      addSuffix: true,
                                    })
                                  : "no expiry"
                              }
                            />
                            <DetailRow
                              label="Last refreshed"
                              value={
                                connection.last_refresh_at
                                  ? formatDistanceToNow(new Date(connection.last_refresh_at), {
                                      addSuffix: true,
                                    })
                                  : "never"
                              }
                            />
                            <DetailRow
                              label="Auto-refresh"
                              value={connection.refresh_token_present ? "on" : "not available"}
                            />
                          </DetailGrid>

                          {connection.scopes_granted.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {connection.scopes_granted.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          {connection.last_refresh_error && (
                            <p className="mt-2.5 rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11.5px] text-(--color-danger-text)">
                              {connection.last_refresh_error}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[12.5px] text-muted-foreground">
                          No credential connected yet.
                        </p>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => void handleReconnect()}
                        disabled={reconnecting}
                      >
                        <ExternalLink className="mr-1.5 size-3.5" />
                        {reconnecting ? "Redirecting…" : connection ? "Reconnect" : "Connect"}
                      </Button>
                    </div>
                  </DrawerSection>

                  <DrawerSection
                    label="Workspace OAuth app"
                    action={
                      <button
                        type="button"
                        onClick={() => setShowAppForm((v) => !v)}
                        className="text-[11px] font-medium text-(--color-primary-text)"
                      >
                        {showAppForm ? "Hide" : "Configure"}
                      </button>
                    }
                  >
                    {showAppForm ? (
                      <div className="rounded-lg border p-3">
                        <ProviderAppForm
                          providerKey={connector.provider_key}
                          providerName={provider?.display_name ?? connector.provider_key}
                          onSaved={() => setShowAppForm(false)}
                        />
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-muted-foreground">
                        Connect flows use this workspace's own {provider?.display_name ?? "provider"}{" "}
                        OAuth app if one is configured, else the deployment default. Configuration is
                        write-only — saving replaces the previous app.
                      </p>
                    )}
                  </DrawerSection>

                  <DrawerSection label="Details">
                    <DetailGrid>
                      <CopyField label="Connector ID" value={connector.id} />
                      <DetailRow label="Provider" value={connector.provider_key} />
                    </DetailGrid>
                  </DrawerSection>
                </TabsContent>

                <TabsContent value="access" className="space-y-6">
                  <DrawerSection label="Agents allowed to execute this connector">
                  {assignmentsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !assignments?.length ? (
                    <DrawerEmpty
                      icon={<KeyRound />}
                      title="No agents granted yet"
                      description="Grant a client below — without a grant, agents get a 404 even with a valid broker token."
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {assignments.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[11.5px] text-foreground">
                              {a.client_id}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {a.action_key ?? "All actions"}
                            </p>
                            {a.input_constraints && Object.keys(a.input_constraints).length > 0 && (
                              <p className="mt-0.5 truncate font-mono text-[10px] text-(--color-primary-text)">
                                limited to {JSON.stringify(a.input_constraints)}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label="Revoke access"
                            onClick={() => void handleRevoke(a.id)}
                            className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:text-(--color-danger-text)"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 space-y-2 rounded-md border p-3">
                    <Input
                      value={newClientId}
                      onChange={(e) => setNewClientId(e.target.value)}
                      placeholder="Agent client ID"
                      className="h-9 font-mono text-xs"
                      autoComplete="off"
                    />
                    <Select value={newActionKey} onValueChange={setNewActionKey}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
                        {meta?.actions.map((a) => (
                          <SelectItem key={a.action_key} value={a.action_key}>
                            {a.action_key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div>
                      <textarea
                        value={newConstraints}
                        onChange={(e) => setNewConstraints(e.target.value)}
                        placeholder={'Input limits (optional JSON) — {"owner":{"equals":"acme-eng"}}'}
                        rows={2}
                        className="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]"
                        spellCheck={false}
                      />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Restrict which inputs this agent may pass. Calls outside the allowlist are
                        denied before the provider is touched.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full text-[length:var(--text-sm)] text-white"
                      onClick={() => void handleGrant()}
                      disabled={granting || !newClientId.trim()}
                    >
                      {granting ? "Granting…" : "Grant"}
                    </Button>
                  </div>
                </DrawerSection>
                </TabsContent>

                <TabsContent value="actions" className="space-y-6">
                <DrawerSection label={`${provider?.display_name ?? connector.provider_key} actions`}>
                  {!meta?.actions.length ? (
                    <DrawerEmpty
                      icon={<Zap />}
                      title="No actions available for this provider yet"
                      description="This provider is catalog-only — it can be connected, but no typed action has shipped for it."
                    />
                  ) : (
                    <div className="space-y-2">
                      {meta.actions.map((a) => (
                        <div key={a.action_key} className="rounded-lg border p-3">
                          <div className="flex items-baseline justify-between">
                            <p className="text-[13px] font-medium text-foreground">{a.display_name}</p>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                              {a.action_key}
                            </span>
                          </div>
                          <p className="mt-1 text-[11.5px] text-muted-foreground">
                            Inputs: {a.inputs.join(", ")}
                          </p>
                        </div>
                      ))}
                      {/*
                        The live, permissioned action schema is served by
                        GET /broker/connectors/:id/actions — but that route
                        requires a broker-audience token (a native M2M/XAA
                        token bound to this workspace's Connector Broker
                        Resource Server), which the admin console's session
                        token is not. This tab shows the static action
                        catalog instead of attempting that call.
                      */}
                    </div>
                  )}
                </DrawerSection>
                </TabsContent>

                <TabsContent value="activity" className="space-y-6">
                  <DrawerSection label="Action log — who did what, allowed or denied">
                    {auditLoading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : !auditRows?.length ? (
                      <DrawerEmpty
                        icon={<Zap />}
                        title="No actions recorded yet"
                        description="Every broker action attempt (allow and deny) lands here with the agent identity, token type, and outcome."
                      />
                    ) : (
                      <div className="space-y-1.5">
                        {auditRows.map((row) => {
                          // F8: allow-but-provider-failed reads amber, not green.
                          const providerFailed =
                            typeof row.provider_status === "number" && row.provider_status >= 400;
                          const pillClass =
                            row.authz_outcome === "deny"
                              ? "bg-(--color-danger-soft) text-(--color-danger-text)"
                              : providerFailed
                                ? "bg-(--color-warning-soft) text-(--color-warning-text)"
                                : "bg-(--color-success-soft) text-(--color-success-text)";
                          const statusBits = [
                            typeof row.broker_status === "number" ? `broker ${row.broker_status}` : null,
                            typeof row.provider_status === "number" ? `provider ${row.provider_status}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <div key={row.id} className="rounded-md border px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11.5px] text-foreground">
                                  {row.action_key}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                                    pillClass,
                                  )}
                                >
                                  {row.action_outcome ?? row.authz_outcome}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                                {statusBits && <> · {statusBits}</>}
                                {row.subject_id ? (
                                  <> · on behalf of <span className="font-mono">{row.subject_id.slice(0, 8)}…</span></>
                                ) : row.actor_client_id ? (
                                  <> · agent <span className="font-mono">{row.actor_client_id.slice(0, 8)}…</span></>
                                ) : null}
                                {row.token_family && <> · {row.token_family}</>}
                                {typeof row.latency_ms === "number" && row.latency_ms > 0 && (
                                  <> · {row.latency_ms}ms</>
                                )}
                              </p>
                              {row.deny_reason && (
                                <p className="mt-1 rounded bg-(--color-danger-soft) px-2 py-1 text-[11px] text-(--color-danger-text)">
                                  {row.deny_reason}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </DrawerSection>
                </TabsContent>

                <TabsContent value="use" className="space-y-6">
                  <DrawerSection label="1 · Mint a broker token">
                    <CodeBlock
                      code={`curl -su "$CLIENT_ID:$CLIENT_SECRET" https://app.authsec.ai/oauth/token \\
  -d grant_type=client_credentials \\
  -d resource=authsec://broker/connectors/${workspaceId || "{workspace_id}"} \\
  -d scope=connector:execute`}
                    />
                  </DrawerSection>

                  <DrawerSection label="2 · Execute an action">
                    <CodeBlock
                      code={`curl -X POST https://app.authsec.ai/broker/connectors/${connector.id}/actions/${
                        firstAction?.action_key ?? "ACTION_KEY"
                      }:execute \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"input":{${firstAction ? firstAction.inputs.map((i) => `"${i}":"..."`).join(",") : '"...":"..."'}}}'`}
                    />
                  </DrawerSection>

                  <DrawerSection label="3 · Or discover it as an MCP tool">
                    <CodeBlock
                      code={`GET  /broker/mcp/tools   →  ${connector.id}__${firstAction?.action_key ?? "ACTION_KEY"}
POST /broker/mcp/call    {"name":"${connector.id}__${firstAction?.action_key ?? "ACTION_KEY"}","arguments":{…}}`}
                    />
                  </DrawerSection>

                  <p className="text-[11px] text-muted-foreground">
                    The agent needs a grant on the Access tab before either call succeeds.
                  </p>
                </TabsContent>
              </DrawerBody>
            </Tabs>

            <DrawerFooter>
              <Button
                variant="outline"
                className="text-(--color-danger-text)"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete connector
              </Button>
            </DrawerFooter>
          </>
        )}
      </RightDrawer>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete connector?</DialogTitle>
            <DialogDescription>
              This removes {connector?.name ?? "this connector"} and its stored credentials. Any
              agent using it will stop working. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              <Trash2 className="mr-1.5 size-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
