import { useMemo } from "react";
import { useListSyncConfigsQuery } from "@/app/api/syncConfigsApi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, FolderSync, Settings, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function DirectorySyncPage() {
  const { data: configs = [], isLoading, refetch } = useListSyncConfigsQuery({});
  const isSyncing = false; // Trigger sync is done via the AD/Entra sync buttons on the Users page
  const navigate = useNavigate();

  const adConfigs = useMemo(() => configs.filter((c: any) => c.source_type === "active_directory" || c.config_type === "ad"), [configs]);
  const entraConfigs = useMemo(() => configs.filter((c: any) => c.source_type === "entra_id" || c.config_type === "entra"), [configs]);

  const handleSync = async (_configId: string, _sourceType: string) => {
    toast("Use the AD/Entra sync buttons on the End Users page to trigger sync");
    refetch();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="default">Active</Badge>;
      case "error": return <Badge variant="destructive">Error</Badge>;
      case "syncing": return <Badge variant="secondary">Syncing</Badge>;
      default: return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Directory Sync</h1>
          <p className="text-muted-foreground mt-1">
            Manage Active Directory and Entra ID synchronization. Users synced from directories are automatically provisioned with workspace memberships.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/end-users")} className="gap-2">
          <Plus className="h-4 w-4" /> Configure New Sync
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading sync configurations...</div>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <FolderSync className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No directory sync configured</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Connect Active Directory or Entra ID to automatically provision and deprovision users.
              </p>
              <Button onClick={() => navigate("/end-users")}>
                <Settings className="h-4 w-4 mr-2" /> Go to Users to Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {adConfigs.length > 0 && (
            <div>
              <h2 className="text-lg font-medium mb-3">Active Directory</h2>
              <div className="space-y-3">
                {adConfigs.map((cfg: any) => (
                  <Card key={cfg.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base">{cfg.config_name || cfg.name || "AD Sync"}</CardTitle>
                          {statusBadge(cfg.status)}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(cfg.id, "ad")}
                          disabled={isSyncing}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                          Sync Now
                        </Button>
                      </div>
                      <CardDescription>
                        {cfg.server_url || cfg.connection_url || "No server configured"}
                        {cfg.last_sync_at && ` · Last synced: ${new Date(cfg.last_sync_at).toLocaleString()}`}
                      </CardDescription>
                    </CardHeader>
                    {cfg.last_sync_error && (
                      <CardContent className="pt-0">
                        <p className="text-sm text-destructive">{cfg.last_sync_error}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {entraConfigs.length > 0 && (
            <div>
              <h2 className="text-lg font-medium mb-3">Entra ID (Azure AD)</h2>
              <div className="space-y-3">
                {entraConfigs.map((cfg: any) => (
                  <Card key={cfg.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base">{cfg.config_name || cfg.name || "Entra Sync"}</CardTitle>
                          {statusBadge(cfg.status)}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(cfg.id, "entra")}
                          disabled={isSyncing}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                          Sync Now
                        </Button>
                      </div>
                      <CardDescription>
                        {cfg.entra_tenant_id && `Tenant: ${cfg.entra_tenant_id}`}
                        {cfg.last_sync_at && ` · Last synced: ${new Date(cfg.last_sync_at).toLocaleString()}`}
                      </CardDescription>
                    </CardHeader>
                    {cfg.last_sync_error && (
                      <CardContent className="pt-0">
                        <p className="text-sm text-destructive">{cfg.last_sync_error}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
