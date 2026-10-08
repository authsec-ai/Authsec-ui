import {
  ArrowLeftRight,
  ChevronsUpDown,
  LogOut,
  Radar,
  Mic,
} from "lucide-react";
import { useAuth } from "@/auth/context/AuthContext";
import { WorkspaceSwitcherItems } from "@/components/workspace-switcher";
import { useLocation, useNavigate } from "react-router-dom";
import { useRbacAudience } from "@/contexts/RbacAudienceContext";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavUser({
  user,
}: {
  user?: {
    name: string;
    email: string;
    avatar: string;
  };
  } = {}) {
  const { isMobile, state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const isIgaConsole = location.pathname.startsWith("/iga");
  const { user: authUser, signOut } = useAuth();
  const { isAdmin } = useRbacAudience();

  const handleSignOut = async () => {
    await signOut();
  };

  const displayName = authUser
    ? authUser.first_name && authUser.last_name
      ? `${authUser.first_name} ${authUser.last_name}`
      : authUser.email.split("@")[0]
    : user?.name || "User";
  const displayEmail = authUser?.email || user?.email || "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
              tooltip={isCollapsed ? displayName : undefined}
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={authUser?.avatar_url || user?.avatar} alt={displayName} />
                <AvatarFallback className="rounded-lg">
                  {displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs">{displayEmail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={authUser?.avatar_url || user?.avatar} alt={displayName} />
                  <AvatarFallback className="rounded-lg">
                    {displayName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs">{displayEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <WorkspaceSwitcherItems />

           
            {isAdmin && (
              <>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-foreground">
                  Voice Agents
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => navigate("/admin/voice-agent")}
                    className="flex items-center gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Add Voice Agent</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Product switcher. Agentic IGA is a separate console with its own
                sidebar — it is not a section of this one. See root AGENTS.md
                "Product transition". */}
            <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-foreground">
              Switch product
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => navigate(isIgaConsole ? "/dashboard" : "/iga/discovery")}
                className="flex items-center gap-2"
              >
                {isIgaConsole ? (
                  <ArrowLeftRight className="h-4 w-4" />
                ) : (
                  <Radar className="h-4 w-4" />
                )}
                <span>{isIgaConsole ? "Back to AuthSec console" : "Agentic IGA"}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
