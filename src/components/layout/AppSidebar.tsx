/**
 * `AppSidebar` — production sidebar for AuthSec.
 *
 * Layout (Launch Control IA):
 *   Dashboard
 *   Workspace : End Users, Applications, AI Agents
 *   Authz     : Application Roles, Role Bindings, Application Scopes
 *   Configure : Identity Providers, Trust Delegation, Secrets, SDK Guides
 *   Monitor : Audit Logs
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Bot,
  BookOpen,
  ClipboardList,
  CreditCard,
  Fingerprint,
  GlobeLock,
  KeyRound,
  LayoutDashboard,
  Layers,
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
  // { title: "Clients", url: "/clients", icon: PlugZap },
  { title: "AI Agents", url: "/agents", icon: Bot },
];

// Workspace-level access control. Roles, Scopes and Assignments are three tabs
// of ONE page (/access/*) — so the sidebar carries a single "Access Control"
// entry rather than three rows that all open the same screen.
const NAV_AUTHZ: NavItem[] = [
  { title: "Access Control", url: "/access/roles", icon: KeyRound },
];

const NAV_MONITOR: NavItem[] = [
  { title: "Audit Logs", url: "/logs/audit", icon: ClipboardList },
];

const NAV_CONFIGURE: NavItem[] = [
  { title: "Identity Providers", url: "/identity-providers", icon: Fingerprint },
  { title: "Trust Delegation", url: "/trust-delegation", icon: GlobeLock },
  { title: "Secrets", url: "/external-services", icon: KeyRound },
  { title: "SDK Guides", url: "/developer/sdk-guides", icon: BookOpen },
];

const NAV_SETTINGS: NavItem[] = [
  { title: "Team", url: "/settings/team", icon: Users },
  { title: "Billing", url: "/admin/billing", icon: CreditCard },
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
          (item.url === "/dashboard" && location.pathname === "/") ||
          // "Access Control" is one nav row for the whole /access/* tabbed page.
          (item.url.startsWith("/access") && location.pathname.startsWith("/access")),
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
    () => ({
      dashboard: attachHandlers(markActive(NAV_DASHBOARD)),
      objects: attachHandlers(markActive(NAV_OBJECTS)),
      authz: attachHandlers(markActive(prefixUrls(NAV_AUTHZ, contextPrefix))),
      monitor: attachHandlers(markActive(NAV_MONITOR)),
      configure: attachHandlers(markActive(NAV_CONFIGURE)),
      settings: attachHandlers(markActive(NAV_SETTINGS)),
    }),
    [contextPrefix, prefixUrls, markActive, attachHandlers],
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
        "border-r border-[var(--app-shell-border)] bg-[var(--app-shell-surface)] [&_[data-slot=sidebar-inner]]:bg-[var(--app-shell-surface)]",
        className,
      )}
      style={
        {
          "--sidebar-surface": "var(--app-shell-surface)",
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
