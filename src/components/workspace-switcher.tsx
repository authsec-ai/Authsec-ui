import { Building, Check } from "lucide-react";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useListMyWorkspacesQuery, useSwitchWorkspaceMutation } from "@/app/api/workspaceApi";
import { switchSessionWorkspace } from "@/auth/switchWorkspace";
import toast from "react-hot-toast";

/**
 * Workspace section of the user menu. Lists the workspaces the server says
 * the user belongs to; choosing one swaps the session token and reloads, so
 * nothing cached for the previous workspace survives (ADR-0001 §8).
 */
export function WorkspaceSwitcherItems() {
  const { data } = useListMyWorkspacesQuery();
  const [switchWorkspace, { isLoading }] = useSwitchWorkspaceMutation();
  const workspaces = data?.workspaces ?? [];
  if (workspaces.length === 0) return null;

  const onSwitch = async (workspaceId: string) => {
    try {
      const res = await switchWorkspace(workspaceId).unwrap();
      switchSessionWorkspace(res.access_token);
    } catch {
      toast.error("Could not switch workspace");
    }
  };

  return (
    <>
      <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-foreground">
        Workspace
      </DropdownMenuLabel>
      <DropdownMenuGroup>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.workspace_id}
            disabled={w.current || isLoading}
            onClick={() => void onSwitch(w.workspace_id)}
            className="flex items-center gap-2"
          >
            <Building className="h-4 w-4" />
            <div className="flex flex-col">
              <span className="font-medium">{w.name || w.workspace_domain}</span>
              {w.role && <span className="text-xs text-foreground">{w.role}</span>}
            </div>
            {w.current && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}
