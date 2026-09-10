/**
 * IgaSidebar — navigation for the Agentic IGA console.
 *
 * Deliberately separate from `AppSidebar`. Agentic IGA is a different product
 * from the AuthSec authorization console, not a section inside it (root
 * AGENTS.md, "Product transition"). Switching between them happens through the
 * product switcher in the bottom-left user menu.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  Fingerprint,
  KeyRound,
  SlidersHorizontal,
  Radar,
  ScanSearch,
  FileText,
  ShieldAlert,
  ClipboardCheck,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
  isActive?: boolean;
  onClick?: () => void;
}

const NAV_DISCOVERY: IgaNavItem[] = [
  { title: "Integrations", url: "/iga/integrations", icon: Radar },
  { title: "Discovered Agents", url: "/iga/agents", icon: ScanSearch },
  { title: "Identities", url: "/iga/identities", icon: Fingerprint },
  // The AWS cloud inventory. Named for the cloud they come from because AWS
  // results do NOT land in the shared discovered_agents table the two items
  // above read from — they have their own route family and their own cloud_*
  // tables, so a reader looking for an IAM role on "Discovered Agents" would
  // never find it.
  //
  // "Compute", not "Workloads": the terminology map in AGENTS.md reserves
  // "Workload" for Kubernetes/SPIFFE pod identities, and these rows are Lambda
  // functions, ECS task definitions, EC2 instances and Bedrock agents.
  { title: "AWS Identities", url: "/iga/cloud/aws/identities", icon: KeyRound },
  { title: "AWS Compute", url: "/iga/cloud/aws/compute", icon: Boxes },
  // Sits under Discovery, not Settings: it defines what a scan looks for, so it
  // belongs beside the scanning it governs rather than in a config drawer.
  { title: "Detection Rules", url: "/iga/detection-rules", icon: SlidersHorizontal },
];

const NAV_GOVERNANCE: IgaNavItem[] = [
  { title: "Provenance", url: "/iga/provenance", icon: FileText },
  { title: "Access Certification", url: "/iga/certification", icon: ClipboardCheck },
  { title: "Separation of Duties", url: "/iga/sod", icon: ShieldAlert },
  { title: "Birthrights & Lifecycle", url: "/iga/birthrights", icon: UserPlus },
  { title: "Enforcement queue", url: "/iga/enforcement", icon: Zap },
];

export function IgaSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = useCallback((path: string) => navigate(path), [navigate]);

  const decorate = useCallback(
    (nav: IgaNavItem[]) =>
      nav.map((item) => ({
        ...item,
        // Match the section root too, so /iga/certification/:id keeps the parent active.
        isActive:
          location.pathname === item.url || location.pathname.startsWith(`${item.url}/`),
        onClick: () => handleNavigation(item.url),
      })),
    [location.pathname, handleNavigation],
  );

  const discoveryItems = useMemo(() => decorate(NAV_DISCOVERY), [decorate]);
  const governanceItems = useMemo(() => decorate(NAV_GOVERNANCE), [decorate]);

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
              onClick={() => handleNavigation("/iga/integrations")}
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
        <NavMain title="Discovery" items={discoveryItems} />
        <NavMain title="Governance" items={governanceItems} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
