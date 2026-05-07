/**
 * `AppSidebar` — production sidebar for AuthSec.
 *
 * Layout (Launch Control IA):
 *   Dashboard
 *   Protect : Applications, Clients, AI Agents
 *   Access  : Users, Roles, Permissions, Assignments, Consent Grants
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
  Fingerprint,
  GlobeLock,
  KeyRound,
  LayoutDashboard,
  Layers,
  PlugZap,
  ShieldPlus,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useAppDispatch } from "../../app/hooks";
import { setCurrentPage } from "../../app/slices/uiSlice";
import { useRbacAudience } from "@/contexts/RbacAudienceContext";
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
import { resolveTenantId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar IA. URLs in NAV_ACCESS are prefixed at render time with the active
// audience (`/admin` or `/enduser`) so the audience switcher continues to work.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_DASHBOARD: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

const NAV_PROTECT: NavItem[] = [
  { title: "Applications", url: "/applications", icon: Layers },
  { title: "Clients", url: "/clients", icon: PlugZap },
  { title: "AI Agents", url: "/agents", icon: Bot },
];

const NAV_ACCESS: NavItem[] = [
  { title: "Users", url: "/users", icon: Users },
  { title: "Roles", url: "/authz/roles", icon: UserCog },
  { title: "Permissions", url: "/authz/permissions", icon: ShieldPlus },
  { title: "Assignments", url: "/authz/role-bindings", icon: UserPlus },
  { title: "Consent Grants", url: "/consent-grants", icon: GlobeLock },
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

export function AppSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { audience } = useRbacAudience();
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setTenantId(resolveTenantId());
    } catch (error) {
      console.error("Failed to resolve tenant ID:", error);
      setTenantId(null);
    }
  }, []);

  const contextPrefix = audience === "admin" ? "/admin" : "/enduser";

  const handleNavigation = useCallback(
    (path: string, pageId: string) => {
      navigate(path);
      dispatch(setCurrentPage(pageId));
    },
    [navigate, dispatch],
  );

  const prefixUrls = useCallback(
    (items: NavItem[], prefix: string): NavItem[] =>
      items.map((item) => ({ ...item, url: `${prefix}${item.url}` })),
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
    () => ({
      dashboard: attachHandlers(markActive(NAV_DASHBOARD)),
      protect: attachHandlers(markActive(NAV_PROTECT)),
      access: attachHandlers(markActive(prefixUrls(NAV_ACCESS, contextPrefix))),
      monitor: attachHandlers(markActive(NAV_MONITOR)),
      configure: attachHandlers(markActive(NAV_CONFIGURE)),
    }),
    [contextPrefix, prefixUrls, markActive, attachHandlers],
  );

  const handleTenantIdClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (tenantId) {
        try {
          await navigator.clipboard.writeText(tenantId);
          toast.success("Tenant ID copied to clipboard");
        } catch (err) {
          console.error("Failed to copy:", err);
          toast.error("Failed to copy Tenant ID");
        }
      }
    },
    [tenantId],
  );

  const tenantIdLabel = useMemo(() => {
    if (!tenantId) return "Not available";
    if (tenantId.length <= 24) return tenantId;
    return `${tenantId.slice(0, 12)}…${tenantId.slice(-8)}`;
  }, [tenantId]);

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
                    title={tenantId ?? undefined}
                    onClick={handleTenantIdClick}
                  >
                    {tenantIdLabel}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={nav.dashboard} />
        <NavMain title="Protect" items={nav.protect} />
        <NavMain title="Access" items={nav.access} />
        <NavMain title="Configure" items={nav.configure} />
        <NavMain title="Monitor" items={nav.monitor} />
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-0 border-t border-[var(--app-shell-border)]">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
