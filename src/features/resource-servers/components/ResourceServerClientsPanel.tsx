import { useState } from "react";
import { PlugZap } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListResourceServerClientsQuery,
  usePreRegisterResourceServerClientMutation,
  useRevokeResourceServerClientMutation,
  type ResourceServer,
} from "@/app/api/resourceServersApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableCard } from "@/theme/components/cards";

import { parseLines } from "../resource-server-utils";

interface ResourceServerClientsPanelProps {
  server: ResourceServer;
}

export function ResourceServerClientsPanel({ server }: ResourceServerClientsPanelProps) {
  const [clientName, setClientName] = useState("");
  const [redirectUris, setRedirectUris] = useState(
    "http://localhost:3000/callback\nhttp://localhost:3000/oidc/auth/callback",
  );

  const { data: registeredClients = [], isLoading } = useListResourceServerClientsQuery(server.id);
  const [preRegisterClient, { isLoading: isRegistering }] =
    usePreRegisterResourceServerClientMutation();
  const [revokeClient, { isLoading: isRevoking }] =
    useRevokeResourceServerClientMutation();

  const handleRegisterClient = async () => {
    const redirectList = parseLines(redirectUris);
    if (!clientName.trim() || redirectList.length === 0) {
      toast.error("Client name and at least one redirect URI are required.");
      return;
    }

    try {
      const response = await preRegisterClient({
        id: server.id,
        body: {
          client_name: clientName.trim(),
          redirect_uris: redirectList,
        },
      }).unwrap();
      toast.success(`Registered OAuth client ${response.client_id}.`);
      setClientName("");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to register OAuth client.");
    }
  };

  const handleRevokeClient = async (clientId: string) => {
    if (!window.confirm(`Revoke client registration for ${clientId}?`)) {
      return;
    }

    try {
      await revokeClient({ id: server.id, clientId }).unwrap();
      toast.success("Client registration revoked.");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to revoke client registration.");
    }
  };

  return (
    <div className="space-y-4">
      <TableCard className="space-y-4 p-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pre-register OAuth clients</h3>
          <p className="text-sm text-muted-foreground">
            Register MCP OAuth clients under this resource server for local or dev environment
            testing.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="resource-server-client-name">Client name</Label>
            <Input
              id="resource-server-client-name"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Claude Desktop"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resource-server-redirect-uris">Redirect URIs</Label>
            <Textarea
              id="resource-server-redirect-uris"
              rows={5}
              value={redirectUris}
              onChange={(event) => setRedirectUris(event.target.value)}
            />
          </div>
          <div>
            <Button onClick={handleRegisterClient} disabled={isRegistering}>
              <PlugZap className="mr-2 h-4 w-4" />
              Register OAuth client
            </Button>
          </div>
        </div>
      </TableCard>

      <TableCard className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Registered OAuth clients</h3>
        </div>
        <div className="divide-y">
          {isLoading ? (
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
                  <div className="truncate text-xs text-muted-foreground">{client.client_id}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{client.registration_type}</Badge>
                  <Badge variant={client.status === "approved" ? "default" : "secondary"}>
                    {client.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevokeClient(client.client_id)}
                    disabled={isRevoking}
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
  );
}
