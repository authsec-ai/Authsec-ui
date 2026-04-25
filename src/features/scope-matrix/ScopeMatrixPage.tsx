import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Plus, ShieldAlert, Boxes, Grid3x3 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetScopeMatrixQuery, useListResourceServerScopesQuery } from "@/app/api/scopeMatrixApi";
import { RescanButton } from "./components/RescanButton";
import { ToolScopeGrid } from "./components/ToolScopeGrid";
import { ScopeDetailModal } from "./components/ScopeDetailModal";
import { CreateScopeModal } from "./components/CreateScopeModal";
import { UnmappedScopesPanel } from "./components/UnmappedScopesPanel";

export function ScopeMatrixPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rsId = id!;

  const { data: matrixData, isLoading, error } = useGetScopeMatrixQuery(rsId);
  const { data: allScopes } = useListResourceServerScopesQuery(rsId);

  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleBackClick = () => {
    navigate("/resource-servers");
  };

  const handleScopeClick = (scopeId: string) => {
    setSelectedScopeId(scopeId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-10xl space-y-4 p-6">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading scope matrix...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !matrixData) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-10xl space-y-4 p-6">
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive">Failed to load scope matrix. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const unmappedScopes = matrixData.unmapped_scopes ?? [];
  const unmappedCount = unmappedScopes.length;
  const protectedDiscovery =
    matrixData.resource_server.status === "degraded" &&
    matrixData.resource_server.last_scan_status === "success" &&
    Number(matrixData.total_tools ?? 0) === 0 &&
    unmappedCount > 0;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={matrixData.resource_server.name}
          description={`Scope to Tool mapping matrix for ${matrixData.resource_server.url}`}
          backButton={
            <Button variant="ghost" size="sm" onClick={handleBackClick}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Resource Servers
            </Button>
          }
          actions={
            <div className="flex gap-2">
              <RescanButton rsId={rsId} />
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Scope
              </Button>
            </div>
          }
        />

        {/* Stats Bar */}
        <div className="grid gap-4 sm:grid-cols-3">
          <TableCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Boxes className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{matrixData.total_tools}</p>
                <p className="text-sm text-muted-foreground">Total Tools</p>
              </div>
            </div>
          </TableCard>

          <TableCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Grid3x3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{matrixData.total_scopes}</p>
                <p className="text-sm text-muted-foreground">Total Scopes</p>
              </div>
            </div>
          </TableCard>

          <TableCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-2xl font-bold text-foreground">{unmappedCount}</p>
                  <p className="text-sm text-muted-foreground">Unmapped Scopes</p>
                </div>
                {unmappedCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    Warning
                  </Badge>
                )}
              </div>
            </div>
          </TableCard>
        </div>

        {/* Tool Scope Grid */}
        <TableCard className="space-y-4 p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Tool Scope Mappings</h2>
            <p className="text-sm text-muted-foreground">
              {protectedDiscovery
                ? "The server is protected, so unauthenticated discovery cannot enumerate tools yet."
                : "Click on a scope to view details or use the dropdown to add new mappings"}
            </p>
          </div>
          {protectedDiscovery ? (
            <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                AuthSec confirmed the MCP endpoint responds with an OAuth bearer challenge. The scopes below came from
                protected-resource metadata, but no tools are visible because the scanner does not yet have a service token for
                <code className="mx-1 rounded bg-white/60 px-1 py-0.5 font-mono text-xs dark:bg-black/20">tools/list</code>.
              </div>
            </div>
          ) : null}
          <ToolScopeGrid
            rsId={rsId}
            tools={matrixData.tools ?? []}
            allScopes={allScopes ?? []}
            onScopeClick={handleScopeClick}
          />
        </TableCard>

        {/* Unmapped Scopes Panel */}
        {unmappedCount > 0 && (
          <UnmappedScopesPanel
            unmappedScopes={unmappedScopes}
            onScopeClick={handleScopeClick}
          />
        )}

        {/* Modals */}
        <ScopeDetailModal
          scopeId={selectedScopeId}
          open={selectedScopeId !== null}
          onOpenChange={(open) => !open && setSelectedScopeId(null)}
          rsId={rsId}
        />

        <CreateScopeModal
          rsId={rsId}
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
        />
      </div>
    </div>
  );
}
