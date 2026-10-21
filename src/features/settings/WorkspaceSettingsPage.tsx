import { useListMyWorkspacesQuery } from "@/app/api/workspaceApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { CopyField, DetailGrid, DetailRow } from "@/components/console/detail";
import { Card, CardContent } from "@/components/ui/card";
import { resolveWorkspaceId } from "@/utils/workspace";

/**
 * Settings → Workspace. The workspace's own details, including the ID the
 * SDKs ask for. The ID used to sit under the logo at the top of the
 * sidebar; that spot is now the product switcher.
 */
export function WorkspaceSettingsPage() {
  const { data, isLoading } = useListMyWorkspacesQuery();
  const current = data?.workspaces.find((w) => w.current);
  let workspaceId = current?.workspace_id ?? "";
  if (!workspaceId) {
    try {
      workspaceId = resolveWorkspaceId() ?? "";
    } catch {
      workspaceId = "";
    }
  }

  return (
    <ConsolePage title="Workspace" description="This workspace's name, address and ID.">
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">This workspace</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading workspace…</p>
          ) : (
            <DetailGrid>
              <DetailRow label="Name" value={current?.name || "—"} />
              <DetailRow label="Your role" value={current?.role || "—"} />
              <DetailRow label="Address" value={current?.workspace_domain || "—"} mono />
              <div />
              {workspaceId ? (
                <CopyField label="Workspace ID (the SDKs ask for this)" value={workspaceId} />
              ) : (
                <DetailRow label="Workspace ID" value="Not available" full />
              )}
            </DetailGrid>
          )}
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
