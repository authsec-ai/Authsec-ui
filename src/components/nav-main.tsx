import { type LucideIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Active-nav treatment (Console Refresh "bar" variant — the design's
 * default/recommended one): soft primary tint + primary-colored icon +
 * semibold label. The left accent bar itself is rendered via `::before` in
 * admin-shell.css (targeting `[data-sidebar="menu-button"][data-active="true"]`)
 * since a pseudo-element bar is awkward to express as utility classes.
 * The tint/text overrides also apply on hover so an active item doesn't
 * flash back to the neutral hover fill.
 */
const ACTIVE_NAV =
  "relative " +
  "data-[active=true]:bg-(--color-primary-soft) data-[active=true]:hover:bg-(--color-primary-soft) " +
  "data-[active=true]:text-(--color-primary-text) data-[active=true]:hover:text-(--color-primary-text) " +
  "data-[active=true]:font-semibold " +
  "data-[active=true]:[&>svg]:text-(--color-primary)";

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
              className={ACTIVE_NAV}
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
