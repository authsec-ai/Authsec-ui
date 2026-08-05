/**
 * `AppSidebar` — production sidebar for AuthSec.
 *
 * Layout (Launch Control IA):
 *   Dashboard
 *   Workspace : End Users, Applications, Clients
 *   Authz     : Roles, Scopes, Assignments
 *   Configure : Identity Providers, SCIM Connections, Directory Sync, Connectors
 *   Monitor   : Audit Logs
 *   Settings  : Team
 *
 * "AI Agents" and "Trust Delegation" used to live here but both surfaces were
 * broken / out of scope; their routes still exist in App.tsx so direct links
 * resolve, but the rail no longer advertises them. See plan phase 0.1.
 *
 * "Secrets" (/external-services) was replaced by "Connectors" (/connectors)
 * — the old page was mock data with no real API behind it. Its route/files
 * are left in place in case anything still links to it directly.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import {
  Bot,
  Cable,
  ClipboardList,
  Fingerprint,
  FolderSync,
  KeyRound,
  LayoutDashboard,
  Layers,
  Link2,
  PlugZap,
  Server,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useAppDispatch } from "../../app/hooks";
import { setCurrentPage } from "../../app/slices/uiSlice";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { AuthSecLogo } from "@/components/ui/authsec-logo";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
  badge?: number;
  /**
   * Items still tied to the legacy `/admin` operator prefix
   * opt in by setting `contextPrefixed: true`. Object-
   * first routes (e.g. /end-users, /settings/team, /consent-grants)
   * leave this false and render as-is.
   */
  contextPrefixed?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar IA. URLs in NAV_ACCESS are prefixed at render time with the operator
// `/admin` route prefix while the API consolidates on one RBAC surface.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_DASHBOARD: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

// PRIMARY OBJECT NAV — end users are the default workspace because they are
// the operational long-tail. Members management lives in Settings, not here.
const NAV_OBJECTS: NavItem[] = [
  { title: "Users", url: "/end-users", icon: Users },
  { title: "Applications", url: "/applications", icon: Layers },
  { title: "Service Accounts", url: "/service-accounts", icon: Server },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Clients", url: "/clients", icon: PlugZap },
];

// Workspace-level access control. Roles, Scopes and Assignments each get their
// own sidebar row — every /access/* route renders its own section (no on-screen
// tab bar), so one row per destination keeps the nav and the page in sync.
const NAV_AUTHZ: NavItem[] = [
  { title: "Roles", url: "/access/roles", icon: UserCog },
  { title: "Scopes", url: "/access/scopes", icon: KeyRound },
  { title: "Assignments", url: "/access/assignments", icon: Link2 },
];

const NAV_MONITOR: NavItem[] = [
  { title: "Auth Logs", url: "/logs/auth", icon: ShieldCheck },
  { title: "Audit Logs", url: "/logs/audit", icon: ClipboardList },
  { title: "M2M Logs", url: "/logs/m2m", icon: PlugZap },
];

const NAV_CONFIGURE: NavItem[] = [
  { title: "Identity Providers", url: "/identity-providers", icon: Fingerprint },
  { title: "SCIM Connections", url: "/scim-connections", icon: Shield },
  { title: "Directory Sync", url: "/directory-sync", icon: FolderSync },
  { title: "Connectors", url: "/connectors", icon: Cable },
];

const NAV_SETTINGS: NavItem[] = [
  { title: "Team", url: "/settings/team", icon: Users },
  { title: "Trusted Issuers", url: "/settings/trusted-issuers", icon: ShieldCheck },
];

export function AppSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Pending client approval count — drives the sidebar badge on "Clients".
  // RTK Query deduplicates: if ClientsPage is open, this is a cache read.
  const { data: allClients } = useListWorkspaceClientsQuery();
  const pendingClientCount = useMemo(
    () => (allClients ?? []).filter((c) => c.status === "pending_approval").length,
    [allClients],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setWorkspaceId(resolveWorkspaceId());
    } catch (error) {
      console.error("Failed to resolve workspace ID:", error);
      setWorkspaceId(null);
    }
  }, []);

  const contextPrefix = "/admin";

  const handleNavigation = useCallback(
    (path: string, pageId: string) => {
      navigate(path);
      dispatch(setCurrentPage(pageId));
    },
    [navigate, dispatch],
  );

  /**
   * Apply the legacy `/admin` prefix only to items that opted in
   * via contextPrefixed=true. Phase A's object-first routes are left untouched.
   */
  const prefixUrls = useCallback(
    (items: NavItem[], prefix: string): NavItem[] =>
      items.map((item) =>
        item.contextPrefixed ? { ...item, url: `${prefix}${item.url}` } : item,
      ),
    [],
  );

  const markActive = useCallback(
    (items: NavItem[]): NavItem[] =>
      items.map((item) => ({
        ...item,
        isActive:
          location.pathname === item.url ||
          location.pathname.startsWith(`${item.url}/`) ||
          (item.url === "/dashboard" && location.pathname === "/"),
      })),
    [location.pathname],
  );

  const attachHandlers = useCallback(
    (items: NavItem[]): NavItem[] =>
      items.map((item) => ({
        ...item,
        onClick: () =>
          handleNavigation(
            item.url,
            item.title.toLowerCase().replace(/\s+/g, "-"),
          ),
      })),
    [handleNavigation],
  );

  const nav = useMemo(
    () => {
      const baseObjects = markActive(NAV_OBJECTS).map((item) =>
        item.url === "/clients"
          ? { ...item, badge: pendingClientCount > 0 ? pendingClientCount : undefined }
          : item,
      );
      return {
        dashboard: attachHandlers(markActive(NAV_DASHBOARD)),
        objects: attachHandlers(baseObjects),
        authz: attachHandlers(markActive(prefixUrls(NAV_AUTHZ, contextPrefix))),
        monitor: attachHandlers(markActive(NAV_MONITOR)),
        configure: attachHandlers(markActive(NAV_CONFIGURE)),
        settings: attachHandlers(markActive(NAV_SETTINGS)),
      };
    },
    [contextPrefix, prefixUrls, markActive, attachHandlers, pendingClientCount],
  );

  const handleWorkspaceIdClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (workspaceId) {
        try {
          await navigator.clipboard.writeText(workspaceId);
          toast.success("Workspace ID copied to clipboard");
        } catch (err) {
          console.error("Failed to copy:", err);
          toast.error("Failed to copy workspace ID");
        }
      }
    },
    [workspaceId],
  );

  const workspaceIdLabel = useMemo(() => {
    if (!workspaceId) return "Not available";
    if (workspaceId.length <= 24) return workspaceId;
    return `${workspaceId.slice(0, 12)}…${workspaceId.slice(-8)}`;
  }, [workspaceId]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "border-r border-[var(--app-shell-border)] bg-[var(--sidebar-surface)] [&_[data-slot=sidebar-inner]]:bg-[var(--sidebar-surface)]",
        className,
      )}
      style={
        {
          "--sidebar-border": "var(--app-shell-border)",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <SidebarHeader className="h-(--header-height) justify-center gap-0 border-b border-[var(--app-shell-border)] p-2">
        <SidebarMenu className="px-2 group-data-[collapsible=icon]:px-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-auto min-h-10 items-center rounded-md px-2.5 py-1.5 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 hover:bg-sidebar-accent/60"
              onClick={() => handleNavigation("/dashboard", "dashboard")}
            >
              <div className="flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <AuthSecLogo className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0 group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-[13px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
                    AuthSec
                  </span>
                  <span
                    className="block truncate text-[9px] font-mono leading-tight text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
                    title={workspaceId ?? undefined}
                    onClick={handleWorkspaceIdClick}
                  >
                    {workspaceIdLabel}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={nav.dashboard} />
        <NavMain title="Workspace" items={nav.objects} />
        <NavMain title="Authz" items={nav.authz} />
        <NavMain title="Configure" items={nav.configure} />
        <NavMain title="Monitor" items={nav.monitor} />
        <NavMain title="Settings" items={nav.settings} />
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-0 border-t border-[var(--app-shell-border)]">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
