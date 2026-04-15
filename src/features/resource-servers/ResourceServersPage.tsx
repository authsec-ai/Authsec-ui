import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Plus, RefreshCcw, Trash2, KeyRound, PlugZap, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageInfoBanner } from "@/components/shared/PageInfoBanner";
import { TableCard } from "@/theme/components/cards";
import {
  useCreateResourceServerMutation,
  useDeleteResourceServerMutation,
  useListResourceServerClientsQuery,
  useListResourceServersQuery,
  usePreRegisterResourceServerClientMutation,
  useRevokeResourceServerClientMutation,
  useRotateResourceServerSecretMutation,
  useUpdateResourceServerMutation,
  type CreateResourceServerRequest,
  type ResourceServer,
} from "@/app/api/resourceServersApi";

type ResourceServerFormState = {
  name: string;
  public_base_url: string;
  protected_base_path: string;
  scopes_supported: string;
  registration_modes: string;
  active: boolean;
};

const DEFAULT_FORM: ResourceServerFormState = {
  name: "",
  public_base_url: "",
  protected_base_path: "/mcp",
  scopes_supported: "tools:read\ntools:write",
  registration_modes: "dcr\nprereg\ncimd",
  active: true,
};

const formFromServer = (server: ResourceServer): ResourceServerFormState => ({
  name: server.name,
  public_base_url: server.public_base_url,
  protected_base_path: server.protected_base_path,
  scopes_supported: (server.scopes_supported ?? []).join("\n"),
  registration_modes: (server.registration_modes ?? []).join("\n"),
  active: server.active,
});

const parseLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

export function ResourceServersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isCreateRoute = location.pathname.endsWith("/new");
  const focusClients = location.pathname.endsWith("/clients");

  const {
    data: resourceServers = [],
    isLoading,
    refetch,
  } = useListResourceServersQuery();
  const [createResourceServer, { isLoading: isCreating }] =
    useCreateResourceServerMutation();
  const [updateResourceServer, { isLoading: isUpdating }] =
    useUpdateResourceServerMutation();
  const [deleteResourceServer, { isLoading: isDeleting }] =
    useDeleteResourceServerMutation();
  const [rotateSecret, { isLoading: isRotating }] =
    useRotateResourceServerSecretMutation();
  const [preRegisterClient, { isLoading: isRegisteringClient }] =
    usePreRegisterResourceServerClientMutation();
  const [revokeClient, { isLoading: isRevokingClient }] =
    useRevokeResourceServerClientMutation();

  const selectedServer = useMemo(
    () => resourceServers.find((server) => server.id === id) ?? null,
    [resourceServers, id],
  );

  const activeServerId = selectedServer?.id ?? null;
  const {
    data: registeredClients = [],
    isLoading: isLoadingClients,
  } = useListResourceServerClientsQuery(activeServerId ?? "", {
    skip: !activeServerId,
  });

  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);
  const [clientName, setClientName] = useState("");
  const [redirectUris, setRedirectUris] = useState("http://localhost:3000/callback");
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  useEffect(() => {
    if (selectedServer) {
      setForm(formFromServer(selectedServer));
      setLatestSecret(null);
      return;
    }
    if (isCreateRoute) {
      setForm(DEFAULT_FORM);
      setLatestSecret(null);
    }
  }, [selectedServer, isCreateRoute]);

  const selectedTab = focusClients ? "clients" : "details";

  const submitLabel = selectedServer ? "Save changes" : "Create resource server";

  const handleFormChange = <K extends keyof ResourceServerFormState>(
    key: K,
    value: ResourceServerFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSelectServer = (serverId: string, tab?: "details" | "clients") => {
    navigate(
      tab === "clients"
        ? `/resource-servers/${serverId}/clients`
        : `/resource-servers/${serverId}`,
    );
  };

  const handleCreateNew = () => {
    navigate("/resource-servers/new");
  };

  const handleSave = async () => {
    const payload: CreateResourceServerRequest & { active?: boolean } = {
      name: form.name.trim(),
      public_base_url: form.public_base_url.trim(),
      protected_base_path: form.protected_base_path.trim() || "/mcp",
      scopes_supported: parseLines(form.scopes_supported),
      registration_modes: parseLines(form.registration_modes),
      active: form.active,
    };

    try {
      if (selectedServer) {
        await updateResourceServer({
          id: selectedServer.id,
          body: payload,
        }).unwrap();
        toast.success("Resource server updated.");
        refetch();
        return;
      }

      const response = await createResourceServer(payload).unwrap();
      toast.success("Resource server created.");
      if (response.introspection_secret) {
        setLatestSecret(response.introspection_secret);
      }
      navigate(`/resource-servers/${response.id}`);
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to save resource server.");
    }
  };

  const handleDelete = async () => {
    if (!selectedServer) return;
    if (!window.confirm(`Delete resource server "${selectedServer.name}"?`)) {
      return;
    }

    try {
      await deleteResourceServer(selectedServer.id).unwrap();
      toast.success("Resource server deleted.");
      navigate("/resource-servers");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to delete resource server.");
    }
  };

  const handleRotateSecret = async () => {
    if (!selectedServer) return;

    try {
      const response = await rotateSecret(selectedServer.id).unwrap();
      setLatestSecret(response.introspection_secret);
      toast.success("Introspection secret rotated.");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to rotate introspection secret.");
    }
  };

  const handleRegisterClient = async () => {
    if (!selectedServer) return;
    const redirectList = parseLines(redirectUris);

    if (!clientName.trim() || redirectList.length === 0) {
      toast.error("Client name and at least one redirect URI are required.");
      return;
    }

    try {
      const response = await preRegisterClient({
        id: selectedServer.id,
        body: {
          client_name: clientName.trim(),
          redirect_uris: redirectList,
        },
      }).unwrap();
      toast.success(`Registered OAuth client ${response.client_id}.`);
      setClientName("");
      setRedirectUris("http://localhost:3000/callback");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to register OAuth client.");
    }
  };

  const handleRevokeClient = async (clientId: string) => {
    if (!selectedServer) return;
    if (!window.confirm(`Revoke client registration for ${clientId}?`)) {
      return;
    }

    try {
      await revokeClient({ id: selectedServer.id, clientId }).unwrap();
      toast.success("Client registration revoked.");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to revoke client registration.");
    }
  };

  return (
    <div className="min-h-screen">
      <div className="space-y-4 p-6 max-w-10xl mx-auto">
        <PageHeader
          title="Resource Servers"
          description="Register protected MCP resources, rotate introspection secrets, and manage the OAuth clients approved to access them."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={handleCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                New Resource Server
              </Button>
            </div>
          }
        />

        <PageInfoBanner
          title="Resource Servers are now the primary protected-resource object."
          description="This replaces the old generic client onboarding model for MCP servers. Configure the public resource URL, supported scopes, registration modes, and the nested OAuth clients approved for this resource."
          features={[
            { text: "Calls the canonical /authsec/resource-servers backend." },
            { text: "Shows one-time introspection secrets only when created or rotated." },
            { text: "Pre-registers OAuth clients under the selected resource server." },
          ]}
          dismissible
          storageKey="resource-servers-info"
        />

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <TableCard className="p-0 overflow-hidden">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Registered resource servers</h2>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading resource servers…</div>
              ) : resourceServers.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No resource servers yet. Create one to begin local OAuth flow testing.
                </div>
              ) : (
                resourceServers.map((server) => {
                  const isSelected = server.id === selectedServer?.id;
                  return (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => handleSelectServer(server.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{server.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{server.resource_uri}</div>
                        </div>
                        <Badge variant={server.active ? "default" : "secondary"}>
                          {server.active ? "active" : "inactive"}
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </TableCard>

          <Tabs value={selectedTab} className="space-y-4">
            <TabsList>
              <TabsTrigger
                value="details"
                onClick={() =>
                  navigate(selectedServer ? `/resource-servers/${selectedServer.id}` : "/resource-servers/new")
                }
              >
                Resource Server
              </TabsTrigger>
              <TabsTrigger
                value="clients"
                disabled={!selectedServer}
                onClick={() =>
                  selectedServer && navigate(`/resource-servers/${selectedServer.id}/clients`)
                }
              >
                Registered OAuth Clients
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <TableCard className="p-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rs-name">Name</Label>
                    <Input
                      id="rs-name"
                      value={form.name}
                      onChange={(event) => handleFormChange("name", event.target.value)}
                      placeholder="Acme MCP Server"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-public-url">Public base URL</Label>
                    <Input
                      id="rs-public-url"
                      value={form.public_base_url}
                      onChange={(event) =>
                        handleFormChange("public_base_url", event.target.value)
                      }
                      placeholder="https://mcp.acme.dev"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rs-path">Protected base path</Label>
                    <Input
                      id="rs-path"
                      value={form.protected_base_path}
                      onChange={(event) =>
                        handleFormChange("protected_base_path", event.target.value)
                      }
                      placeholder="/mcp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Current resource URI</Label>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {selectedServer?.resource_uri ||
                        `${form.public_base_url.replace(/\/$/, "")}${form.protected_base_path || "/mcp"}`}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rs-scopes">Supported scopes</Label>
                    <Textarea
                      id="rs-scopes"
                      value={form.scopes_supported}
                      onChange={(event) =>
                        handleFormChange("scopes_supported", event.target.value)
                      }
                      rows={6}
                      placeholder={"tools:read\ntools:write"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-modes">Registration modes</Label>
                    <Textarea
                      id="rs-modes"
                      value={form.registration_modes}
                      onChange={(event) =>
                        handleFormChange("registration_modes", event.target.value)
                      }
                      rows={6}
                      placeholder={"dcr\nprereg\ncimd"}
                    />
                  </div>
                </div>

                {selectedServer && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        {selectedServer.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Registration modes</Label>
                      <div className="flex flex-wrap gap-2">
                        {(selectedServer.registration_modes ?? []).map((mode) => (
                          <Badge key={mode} variant="outline">
                            {mode}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {latestSecret && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <KeyRound className="mt-0.5 h-5 w-5 text-amber-700" />
                      <div className="space-y-1">
                        <div className="font-medium text-amber-900">
                          One-time introspection secret
                        </div>
                        <div className="break-all font-mono text-sm text-amber-800">
                          {latestSecret}
                        </div>
                        <div className="text-xs text-amber-700">
                          Copy this now. The backend stores only the hash after creation or rotation.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleSave} disabled={isCreating || isUpdating}>
                    <Server className="mr-2 h-4 w-4" />
                    {submitLabel}
                  </Button>
                  {selectedServer && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRotateSecret}
                        disabled={isRotating}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Rotate introspection secret
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </TableCard>
            </TabsContent>

            <TabsContent value="clients">
              <div className="space-y-4">
                <TableCard className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        Pre-register OAuth clients
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Register MCP OAuth clients under this resource server for local E2E testing.
                      </p>
                    </div>
                  </div>

                  {!selectedServer ? (
                    <div className="text-sm text-muted-foreground">
                      Select a resource server first.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rs-client-name">Client name</Label>
                        <Input
                          id="rs-client-name"
                          value={clientName}
                          onChange={(event) => setClientName(event.target.value)}
                          placeholder="Local Claude Desktop"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rs-client-redirects">Redirect URIs</Label>
                        <Textarea
                          id="rs-client-redirects"
                          rows={4}
                          value={redirectUris}
                          onChange={(event) => setRedirectUris(event.target.value)}
                          placeholder={"http://localhost:3000/callback\nhttp://localhost:3000/oidc/auth/callback"}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={handleRegisterClient} disabled={isRegisteringClient}>
                          <PlugZap className="mr-2 h-4 w-4" />
                          Register OAuth client
                        </Button>
                      </div>
                    </div>
                  )}
                </TableCard>

                <TableCard className="overflow-hidden p-0">
                  <div className="border-b px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Registered OAuth clients
                    </h3>
                  </div>
                  <div className="divide-y">
                    {!selectedServer ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        Select a resource server to inspect client registrations.
                      </div>
                    ) : isLoadingClients ? (
                      <div className="p-4 text-sm text-muted-foreground">Loading registered clients…</div>
                    ) : registeredClients.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        No OAuth clients registered for this resource server yet.
                      </div>
                    ) : (
                      registeredClients.map((client) => (
                        <div
                          key={client.client_id}
                          className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{client.client_name}</div>
                            <div className="text-xs text-muted-foreground">{client.client_id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{client.registration_type}</Badge>
                            <Badge variant={client.status === "approved" ? "default" : "secondary"}>
                              {client.status}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevokeClient(client.client_id)}
                              disabled={isRevokingClient}
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TableCard>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default ResourceServersPage;
