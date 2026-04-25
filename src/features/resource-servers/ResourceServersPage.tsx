import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, RefreshCcw } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useCreateResourceServerMutation,
  useDeleteResourceServerMutation,
  useListResourceServersQuery,
  useRotateResourceServerSecretMutation,
  useUpdateResourceServerMutation,
  type ResourceServer,
} from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/theme/components/cards";

import { ResourceServerFormDialog } from "./components/ResourceServerFormDialog";
import { ResourceServerSecretBanner } from "./components/ResourceServerSecretBanner";
import { ResourceServersTable } from "./components/ResourceServersTable";
import {
  DEFAULT_FORM,
  buildResourceServerPayload,
  formFromServer,
  type ResourceServerSecretState,
} from "./resource-server-utils";

type ResourceServerLocationState = {
  latestSecret?: ResourceServerSecretState;
};

export default function ResourceServersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isCreateOpen = searchParams.get("create") === "1";

  const { data: resourceServers = [], isLoading, refetch } = useListResourceServersQuery();
  const [createResourceServer, { isLoading: isCreating }] = useCreateResourceServerMutation();
  const [updateResourceServer, { isLoading: isUpdating }] = useUpdateResourceServerMutation();
  const [deleteResourceServer] = useDeleteResourceServerMutation();
  const [rotateSecret] = useRotateResourceServerSecretMutation();

  const [editingServer, setEditingServer] = useState<ResourceServer | null>(null);
  const [latestSecret, setLatestSecret] = useState<ResourceServerSecretState | null>(null);

  const locationState = (location.state as ResourceServerLocationState | null) ?? null;

  useEffect(() => {
    if (locationState?.latestSecret) {
      setLatestSecret(locationState.latestSecret);
    }
    if (locationState) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, locationState, navigate]);

  const handleCreate = async (
    payload: ReturnType<typeof buildResourceServerPayload>,
  ) => {
    try {
      const response = await createResourceServer(payload).unwrap();
      toast.success("Resource server created.");
      navigate(`/resource-servers/${response.id}/onboarding`, {
        replace: true,
        state: {
          latestSecret: response.introspection_secret
            ? {
                value: response.introspection_secret,
                source: "created",
                resourceServerId: response.id,
              }
            : undefined,
        } satisfies ResourceServerLocationState,
      });
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to create resource server.");
    }
  };

  const handleEdit = async (
    payload: ReturnType<typeof buildResourceServerPayload>,
  ) => {
    if (!editingServer) return;
    try {
      await updateResourceServer({ id: editingServer.id, body: payload }).unwrap();
      toast.success("Resource server updated.");
      setEditingServer(null);
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to update resource server.");
    }
  };

  const handleDelete = async (server: ResourceServer) => {
    if (!window.confirm(`Delete resource server "${server.name}"?`)) {
      return;
    }

    try {
      await deleteResourceServer(server.id).unwrap();
      toast.success("Resource server deleted.");
      if (editingServer?.id === server.id) {
        setEditingServer(null);
      }
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to delete resource server.");
    }
  };

  const handleRotateSecret = async (server: ResourceServer) => {
    try {
      const response = await rotateSecret(server.id).unwrap();
      setLatestSecret({
        value: response.introspection_secret,
        source: "rotated",
        resourceServerId: server.id,
      });
      toast.success("Introspection secret rotated.");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to rotate introspection secret.");
    }
  };

  const editInitialValues = useMemo(
    () => (editingServer ? formFromServer(editingServer) : DEFAULT_FORM),
    [editingServer],
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title="Resource Servers"
          description="Register protected MCP resources, rotate introspection secrets, and manage the OAuth clients approved to access them."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={() => navigate("/resource-servers?create=1")}>
                <Plus className="mr-2 h-4 w-4" />
                New Resource Server
              </Button>
            </div>
          }
        />

        {latestSecret ? (
          <ResourceServerSecretBanner
            secret={latestSecret}
            onDismiss={() => setLatestSecret(null)}
          />
        ) : null}

        <TableCard className="space-y-4 p-4 sm:p-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading resource servers…
            </div>
          ) : (
            <ResourceServersTable
              resourceServers={resourceServers}
              onOnboarding={(server) => navigate(`/resource-servers/${server.id}/onboarding`)}
              onDetails={(server) => navigate(`/resource-servers/${server.id}`)}
              onEdit={(server) => setEditingServer(server)}
              onScopeMatrix={(server) =>
                navigate(`/resource-servers/${server.id}/scope-matrix`)
              }
              onRegisteredOAuthClients={(server) =>
                navigate(`/resource-servers/${server.id}/clients`)
              }
              onRotateSecret={handleRotateSecret}
              onDelete={handleDelete}
            />
          )}

          {!isLoading && resourceServers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No resource servers yet. Create one to begin protected MCP resource testing.
            </div>
          ) : null}
        </TableCard>
      </div>

      <ResourceServerFormDialog
        open={isCreateOpen}
        onOpenChange={(open) => !open && navigate("/resource-servers")}
        mode="create"
        onSubmit={handleCreate}
        isSaving={isCreating}
      />

      <ResourceServerFormDialog
        open={Boolean(editingServer)}
        onOpenChange={(open) => !open && setEditingServer(null)}
        mode="edit"
        initialValues={editInitialValues}
        onSubmit={handleEdit}
        isSaving={isUpdating}
      />
    </div>
  );
}
