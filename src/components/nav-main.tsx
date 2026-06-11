import { type LucideIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Quiet active-nav treatment (Console Refresh): neutral fill (via
 * `--sidebar-accent`), a primary-colored icon, and a small trailing accent
 * dot. The dot is suppressed in the collapsed icon-only rail.
 */
const QUIET_ACTIVE_NAV =
  "data-[active=true]:[&>svg]:text-(--color-primary) " +
  "data-[active=true]:after:ml-auto data-[active=true]:after:size-1.5 " +
  "data-[active=true]:after:shrink-0 data-[active=true]:after:rounded-full " +
  "data-[active=true]:after:bg-(--color-primary) data-[active=true]:after:content-[''] " +
  "group-data-[collapsible=icon]:data-[active=true]:after:hidden";

export function NavMain({
  items,
  title,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    onClick?: () => void;
    /** Optional count badge. Shown as a small pill when > 0. Hidden in icon-only rail. */
    badge?: number;
  }[];
  title?: string;
}) {
  return (
    <SidebarGroup>
      {title && <SidebarGroupLabel>{title}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.isActive}
              onClick={item.onClick}
              className={QUIET_ACTIVE_NAV}
            >
              {item.icon && <item.icon />}
              <span>{item.title}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className="ml-auto shrink-0 rounded-full bg-[color:color-mix(in_oklch,var(--color-warning)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-warning)] group-data-[collapsible=icon]:hidden"
                  aria-label={`${item.badge} pending`}
                >
                  {item.badge}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
