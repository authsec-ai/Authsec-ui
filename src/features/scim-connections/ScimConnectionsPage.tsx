import { useState } from "react";
import {
  useListScimConnectionsQuery,
  useCreateScimConnectionMutation,
  useRevokeScimConnectionMutation,
} from "@/app/api/scimConnectionsApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Plus, Trash2, Shield, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

export default function ScimConnectionsPage() {
  const { data: connections = [], isLoading } = useListScimConnectionsQuery();
  const [createConnection, { isLoading: isCreating }] = useCreateScimConnectionMutation();
  const [revokeConnection] = useRevokeScimConnectionMutation();
  const [newToken, setNewToken] = useState<{ token: string; endpoint: string } | null>(null);

  const handleCreate = async () => {
    try {
      const result = await createConnection({}).unwrap();
      setNewToken({ token: result.token, endpoint: result.endpoint });
      toast.success("SCIM connection created");
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to create connection");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this SCIM connection? Users provisioned via this token will no longer sync.")) return;
    try {
      await revokeConnection(id).unwrap();
      toast.success("Connection revoked");
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to revoke");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SCIM Connections</h1>
          <p className="text-muted-foreground mt-1">
            Manage SCIM 2.0 provisioning tokens for automated user sync from identity providers like Okta, Azure AD, or OneLogin.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          {isCreating ? "Creating..." : "New Connection"}
        </Button>
      </div>

      {newToken && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Shield className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <p className="font-medium">SCIM connection created. Copy the token now — it won't be shown again.</p>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Bearer Token</span>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono flex-1 break-all">{newToken.token}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newToken.token)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">SCIM Endpoint</span>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono flex-1 break-all">{newToken.endpoint}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newToken.endpoint)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewToken(null)} className="mt-2">
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Loading connections...</div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No SCIM connections</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create a SCIM connection to provision users from your identity provider automatically.
              </p>
              <Button onClick={handleCreate} disabled={isCreating}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Card key={conn.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-mono">{conn.id.slice(0, 8)}...</CardTitle>
                    <Badge variant={conn.status === "active" ? "default" : "destructive"}>
                      {conn.status}
                    </Badge>
                  </div>
                  {conn.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(conn.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Revoke
                    </Button>
                  )}
                </div>
                <CardDescription>
                  Created {new Date(conn.created_at).toLocaleDateString()}
                  {conn.revoked_at && ` · Revoked ${new Date(conn.revoked_at).toLocaleDateString()}`}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-2">
            <li>Click <strong>New Connection</strong> to generate a SCIM token</li>
            <li>Copy the <strong>Bearer Token</strong> and <strong>SCIM Endpoint URL</strong></li>
            <li>In your identity provider (Okta, Azure AD, OneLogin), configure SCIM provisioning with:
              <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground">
                <li>Base URL: the SCIM Endpoint shown above</li>
                <li>Authentication: Bearer Token</li>
                <li>Token: the token you copied</li>
              </ul>
            </li>
            <li>Test the connection from your IdP, then enable provisioning</li>
          </ol>
          <a
            href="https://docs.authsec.dev/scim"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-primary hover:underline mt-2"
          >
            <ExternalLink className="h-3 w-3" /> Read the full SCIM setup guide
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
