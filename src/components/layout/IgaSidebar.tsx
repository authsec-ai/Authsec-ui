/**
 * IgaSidebar — navigation for the Agentic IGA console.
 *
 * Deliberately separate from `AppSidebar`. Agentic IGA is a different product
 * from the AuthSec authorization console, not a section inside it (root
 * AGENTS.md, "Product transition"). Switching between them happens through the
 * product switcher in the bottom-left user menu.
 *
 * Four destinations, one per task (SPEC-console-revamp.md): connect, find,
 * decide, review. Policy and Logs are previews and say so. Object pages
 * (workloads, identities, resources, a connection's detail) belong to the
 * destination that opens them, so it stays highlighted on them.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Cable, Radar, Scale, ScrollText, type LucideIcon } from "lucide-react";

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
import { cn } from "@/lib/utils";

interface IgaNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Other sections this destination owns: the detail pages it opens. */
  activeFor?: string[];
  /** A word beside the label: "Preview". */
  tag?: string;
}

const NAV: IgaNavItem[] = [
  { title: "Connections", url: "/iga/connections", icon: Cable },
  {
    title: "Discovery",
    url: "/iga/discovery",
    icon: Radar,
    activeFor: ["/iga/estate", "/iga/identities", "/iga/resources", "/iga/external-principals", "/iga/sightings", "/iga/k8s"],
  },
  { title: "Policy", url: "/iga/policy", icon: Scale, tag: "Preview" },
  { title: "Logs", url: "/iga/logs", icon: ScrollText, tag: "Preview" },
];

export function IgaSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = useCallback((path: string) => navigate(path), [navigate]);

  const items = useMemo(
    () =>
      NAV.map((item) => ({
        ...item,
        isActive: [item.url, ...(item.activeFor ?? [])].some(
          (url) => location.pathname === url || location.pathname.startsWith(`${url}/`),
        ),
        onClick: () => handleNavigation(item.url),
      })),
    [location.pathname, handleNavigation],
  );

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
              onClick={() => handleNavigation("/iga/discovery")}
            >
              <div className="flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center">
                <AuthSecLogo className="size-5 shrink-0" />
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <div className="truncate text-sm font-semibold leading-tight">
                    Agentic IGA
                  </div>
                  <div className="truncate text-[11px] leading-tight text-muted-foreground">
                    Agent Identity Governance
                  </div>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
