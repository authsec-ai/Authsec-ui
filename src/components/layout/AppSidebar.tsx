/**
 * `AppSidebar` — the one sidebar for both products (UX proposal, build notes):
 *
 *   AuthSec · <workspace>
 *   Home
 *   ▾ AUTHSEC        MCP, Agents, Users, Policies, Logs
 *   ▸ AGENTIC IGA    Accounts, Discovery, Policy, Logs
 *   Settings
 *   <you>
 *
 * Fixed width, full height, surface colour, no wash. AuthSec and Agentic
 * IGA are collapsible groups; a collapsed group says how many pages it holds.
 * The group holding the current page opens itself. Agentic IGA's selected row
 * uses the IGA accent (the second product's colour) instead of AuthSec blue.
 *
 * Every row owns the routes of the page it opens (`match`), so it stays
 * highlighted on that page's tabs and sub-pages.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  Cable,
  ChevronRight,
  LayoutDashboard,
  Radar,
  Scale,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { useListMyWorkspacesQuery } from "@/app/api/workspaceApi";
import { useAppDispatch } from "../../app/hooks";
import { setCurrentPage } from "../../app/slices/uiSlice";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { AuthSecLogo } from "@/components/ui/authsec-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { usePolicyCapabilities } from "@/features/iga/policy/shared/usePolicyCapabilities";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Other routes this row owns (prefix match): its page's tabs and sub-pages. */
  match?: string[];
  /** Highlight on `url` itself only, not on its sub-paths. */
  exact?: boolean;
  tag?: string;
}

type GroupId = "core" | "iga";

const NAV_HOME: NavItem = { title: "Home", url: "/dashboard", icon: LayoutDashboard };

const NAV_CORE: NavItem[] = [
  { title: "MCP", url: "/applications", icon: Server, match: ["/resource-servers"] },
  {
    title: "Agents",
    url: "/agents",
    icon: Bot,
    match: ["/admin/voice-agent", "/service-accounts", "/clients"],
  },
  {
    title: "Users",
    url: "/end-users",
    icon: Users,
    match: ["/settings/team", "/identity-providers", "/users"],
  },
  { title: "Policies", url: "/policies", icon: ShieldCheck, match: ["/access"] },
  // Exact: /logs/configure (Log forwarding) belongs to Settings.
  { title: "Logs", url: "/logs", icon: ScrollText, exact: true },
];

const NAV_IGA: NavItem[] = [
  // Route kept as /iga/connections so existing links resolve.
  { title: "Accounts", url: "/iga/connections", icon: Cable },
  {
    title: "Discovery",
    url: "/iga/discovery",
    icon: Radar,
    match: [
      "/iga/estate",
      "/iga/identities",
      "/iga/resources",
      "/iga/external-principals",
      "/iga/sightings",
      "/iga/k8s",
    ],
  },
  { title: "Policy", url: "/iga/policy", icon: Scale, tag: "Soon" },
  { title: "Logs", url: "/iga/logs", icon: ScrollText, tag: "Preview" },
];

const NAV_SETTINGS: NavItem = {
  title: "Settings",
  url: "/settings",
  icon: Settings,
  exact: true,
  match: [
    "/custom-domains",
    "/logs/configure",
    "/scim-connections",
    "/directory-sync",
    "/settings/trusted-issuers",
  ],
};

const under = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

const isActive = (item: NavItem, pathname: string) =>
  (item.exact ? pathname === item.url : under(pathname, item.url)) ||
  (item.match ?? []).some((p) => under(pathname, p)) ||
  (item.url === "/dashboard" && pathname === "/");

const GROUPS_KEY = "authsec.sidebar.groups";

function readGroups(): Partial<Record<GroupId, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** Group heading: "AUTHSEC", a chevron, and "N pages" while collapsed. */
function GroupToggle({
  label,
  open,
  count,
  onToggle,
  controls,
}: {
  label: string;
  open: boolean;
  count: number;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] font-semibold uppercase tracking-[0.06em] text-(--color-text) transition-colors hover:bg-(--color-hover) group-data-[collapsible=icon]:hidden"
    >
      <ChevronRight
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-(--color-text-muted) transition-transform duration-200 ease-out motion-reduce:transition-none",
          open && "rotate-90",
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      <span
        aria-hidden={open}
        className={cn(
          "shrink-0 text-[12.5px] font-semibold normal-case tracking-normal text-(--color-text-muted) transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-0" : "opacity-100",
        )}
      >
        {count} pages
      </span>
    </button>
  );
}

/**
 * A group's rows. Always mounted so opening and closing can animate: the
 * height runs from 0 to its content's height (grid rows 0fr → 1fr, no
 * measuring) while the rows fade. Closed, it is `inert`, so its links leave
 * the tab order and the accessibility tree.
 */
function GroupBody({
  id,
  open,
  product,
  children,
}: {
  id: string;
  open: boolean;
  product?: "iga";
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      data-product={product}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden [&_[data-sidebar=menu-button]]:pl-7 group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:pl-2">
        {children}
      </div>
    </div>
  );
}

export function AppSidebar({
  className,
  style,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Apps waiting for approval: the badge on Agents, whose Other clients
  // filter lists them. RTK Query deduplicates with the page.
  const { data: allClients } = useListWorkspaceClientsQuery();
  const pendingClientCount = useMemo(
    () => (allClients ?? []).filter((c) => c.status === "pending_approval").length,
    [allClients],
  );

  const { data: workspaceData } = useListMyWorkspacesQuery();
  const current = workspaceData?.workspaces?.find((w) => w.current);
  // Unknown until /authsec/workspaces answers with a current workspace; then
  // the line is left out rather than showing a placeholder word.
  const workspaceName = current?.name || current?.workspace_domain || null;

  // IGA Policy and Logs are previews until the policy product is known to be
  // on. The tag stays while the capability loads or cannot be read.
  const policyOn = usePolicyCapabilities(getWorkspaceId() ?? "").state === "on";

  const inIga = pathname.startsWith("/iga");
  const inCore = NAV_CORE.some((item) => isActive(item, pathname));

  // Opening a page opens the group holding it; the heading can still close it.
  const withCurrentOpen = (g: Partial<Record<GroupId, boolean>>) => ({
    ...g,
    ...(inCore ? { core: true } : {}),
    ...(inIga ? { iga: true } : {}),
  });
  const [groups, setGroups] = useState<Partial<Record<GroupId, boolean>>>(() => withCurrentOpen(readGroups()));
  const [openedFor, setOpenedFor] = useState(pathname);
  if (openedFor !== pathname) {
    setOpenedFor(pathname);
    if ((inCore && groups.core === false) || (inIga && groups.iga === false)) setGroups(withCurrentOpen);
  }
  const coreOpen = groups.core ?? !inIga;
  const igaOpen = groups.iga ?? inIga;

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch {
      /* storage unavailable: the groups just don't remember */
    }
  }, [groups]);

  const toggle = (id: GroupId, open: boolean) => setGroups((g) => ({ ...g, [id]: !open }));

  const handleNavigation = useCallback(
    (path: string, pageId: string) => {
      navigate(path);
      dispatch(setCurrentPage(pageId));
    },
    [navigate, dispatch],
  );

  const build = useCallback(
    (items: NavItem[]) =>
      items.map((item) => ({
        ...item,
        tag:
          policyOn && (item.url === "/iga/policy" || item.url === "/iga/logs")
            ? undefined
            : item.tag,
        badge: item.url === "/agents" && pendingClientCount > 0 ? pendingClientCount : undefined,
        isActive: isActive(item, pathname),
        onClick: () =>
          handleNavigation(item.url, item.title.toLowerCase().replace(/[^a-z]+/g, "-")),
      })),
    [pathname, handleNavigation, pendingClientCount, policyOn],
  );

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "border-r border-(--color-border-subtle) bg-(--color-surface-raised) [&_[data-slot=sidebar-inner]]:bg-(--color-surface-raised)",
        className,
      )}
      style={
        {
          "--sidebar-border": "var(--color-border-subtle)",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <SidebarHeader className="h-(--header-height) justify-center gap-0 border-b border-(--color-border-subtle) px-4 group-data-[collapsible=icon]:px-2">
        <button
          type="button"
          onClick={() => handleNavigation("/dashboard", "home")}
          className="flex min-w-0 items-center gap-3 text-left"
          aria-label={workspaceName ? `AuthSec, ${workspaceName}: go to Home` : "AuthSec: go to Home"}
        >
          <AuthSecLogo className="size-9 shrink-0" />
          <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[15px] font-bold text-(--color-text)">AuthSec</span>
            {workspaceName ? (
              <span className="truncate text-[12.5px] text-(--color-text-muted)">{workspaceName}</span>
            ) : null}
          </span>
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-1 py-3">
        <NavMain items={build([NAV_HOME])} />

        <SidebarGroup className="py-0">
          <GroupToggle
            label="AuthSec"
            open={coreOpen}
            count={NAV_CORE.length}
            onToggle={() => toggle("core", coreOpen)}
            controls="sidebar-group-core"
          />
        </SidebarGroup>
        <GroupBody id="sidebar-group-core" open={coreOpen}>
          <NavMain items={build(NAV_CORE)} />
        </GroupBody>

        <SidebarGroup className="py-0">
          <GroupToggle
            label="Agentic IGA"
            open={igaOpen}
            count={NAV_IGA.length}
            onToggle={() => toggle("iga", igaOpen)}
            controls="sidebar-group-iga"
          />
        </SidebarGroup>
        <GroupBody id="sidebar-group-iga" open={igaOpen} product="iga">
          <NavMain items={build(NAV_IGA)} />
        </GroupBody>

        <NavMain items={build([NAV_SETTINGS])} />
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-0 border-t border-(--color-border-subtle)">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
