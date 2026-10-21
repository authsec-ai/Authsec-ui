import { BookOpen, ChevronsUpDown, CircleHelp, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/context/AuthContext";
import { useListMyWorkspacesQuery } from "@/app/api/workspaceApi";
import { GlossaryDrawer } from "@/components/layout/GlossaryButton";
import { openGlossary } from "@/components/layout/glossary";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
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

const DOCS_URL = "https://docs.authsec.dev/getting-started";

/**
 * The menu under your name at the bottom of the sidebar. It is only about
 * you: Your profile · theme · Glossary · Docs and help · Sign out. There is
 * no top bar, so the light/dark switch and the glossary live here. Switching
 * workspace is on Your profile (Your workspaces); workspace settings are
 * Settings in the sidebar.
 */
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
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { user: authUser, signOut } = useAuth();
  const { data: workspaceData } = useListMyWorkspacesQuery();
  const workspaces = workspaceData?.workspaces ?? [];
  const currentRole = workspaces.find((w) => w.current)?.role;

  const displayName = authUser
    ? authUser.first_name && authUser.last_name
      ? `${authUser.first_name} ${authUser.last_name}`
      : authUser.email.split("@")[0]
    : user?.name || "User";
  const displayEmail = authUser?.email || user?.email || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

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
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs">{displayEmail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="px-2 py-2 font-normal">
              <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {displayEmail}
                {currentRole ? ` · ${currentRole}` : ""}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => navigate("/profile")}>
              <UserRound />
              Your profile
            </DropdownMenuItem>


            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTheme(isDark ? "light" : "dark");
              }}
            >
              {isDark ? <Sun /> : <Moon />}
              {isDark ? "Light theme" : "Dark theme"}
            </DropdownMenuItem>

            <DropdownMenuItem
              // Opened after the menu has closed, so the menu's focus return
              // does not land behind the panel.
              onSelect={() => window.setTimeout(openGlossary, 0)}
            >
              <BookOpen />
              Glossary
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                <CircleHelp />
                Docs and help
              </a>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <GlossaryDrawer />
    </SidebarMenu>
  );
}
