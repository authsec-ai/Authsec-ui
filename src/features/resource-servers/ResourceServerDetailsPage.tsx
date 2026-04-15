import { useMemo, useState } from "react";
import { ArrowLeft, Code2, Edit, KeyRound, MessageSquareText, ShieldCheck, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useDeleteResourceServerMutation,
  useGetResourceServerQuery,
  useRotateResourceServerSecretMutation,
  useUpdateResourceServerMutation,
} from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/theme/components/cards";

import { ResourceServerFormDialog } from "./components/ResourceServerFormDialog";
import { ResourceServerDetailsPanel } from "./components/ResourceServerDetailsPanel";
import { ResourceServerSecretBanner } from "./components/ResourceServerSecretBanner";
import {
  DEFAULT_FORM,
  buildResourceServerPayload,
  formFromServer,
  type ResourceServerSecretState,
} from "./resource-server-utils";

export function ResourceServerDetailsPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();

  const { data: server, isLoading } = useGetResourceServerQuery(id);
  const [updateResourceServer, { isLoading: isUpdating }] = useUpdateResourceServerMutation();
  const [deleteResourceServer, { isLoading: isDeleting }] = useDeleteResourceServerMutation();
  const [rotateSecret, { isLoading: isRotating }] = useRotateResourceServerSecretMutation();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [latestSecret, setLatestSecret] = useState<ResourceServerSecretState | null>(null);

  const initialValues = useMemo(
    () => (server ? formFromServer(server) : DEFAULT_FORM),
    [server],
  );

  const handleUpdate = async (
    payload: ReturnType<typeof buildResourceServerPayload>,
  ) => {
    if (!server) return;
    try {
      await updateResourceServer({ id: server.id, body: payload }).unwrap();
      toast.success("Resource server updated.");
      setIsEditOpen(false);
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to update resource server.");
    }
  };

  const handleRotateSecret = async () => {
    if (!server) return;
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

  const handleDelete = async () => {
    if (!server) return;
    if (!window.confirm(`Delete resource server "${server.name}"?`)) {
      return;
    }
    try {
      await deleteResourceServer(server.id).unwrap();
      toast.success("Resource server deleted.");
      navigate("/resource-servers");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to delete resource server.");
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={server?.name ?? "Resource Server"}
          description="Inspect the registered protected resource and launch operational actions without using the list view."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/resource-servers")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to list
              </Button>
              {server ? (
                <>
                  <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/clients`)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Registered OAuth Clients
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/sdk`)}>
                    <Code2 className="mr-2 h-4 w-4" />
                    View SDK
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/prompt`)}>
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Generate Prompt
                  </Button>
                  <Button variant="outline" onClick={handleRotateSecret} disabled={isRotating}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Rotate Introspection Secret
                  </Button>
                  <Button onClick={() => setIsEditOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        {latestSecret ? (
          <ResourceServerSecretBanner
            secret={latestSecret}
            onDismiss={() => setLatestSecret(null)}
          />
        ) : null}

        <TableCard className="p-6">
          {isLoading || !server ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isLoading ? "Loading resource server…" : "Resource server not found."}
            </div>
          ) : (
            <ResourceServerDetailsPanel server={server} />
          )}
        </TableCard>
      </div>

      <ResourceServerFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        mode="edit"
        initialValues={initialValues}
        onSubmit={handleUpdate}
        isSaving={isUpdating}
      />
    </div>
  );
}

export default ResourceServerDetailsPage;
