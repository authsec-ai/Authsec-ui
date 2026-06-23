import { useEffect, useState } from "react";
import { ModeToggle } from "../mode-toggle";
import { Monitor } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
// Hidden for now: notifications popover
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";
import { Breadcrumb } from "./Breadcrumb";
// Hidden for now: search bar / command palette (⌘K disabled)
// import {
//   CommandPalette,
//   CommandSearchButton,
//   useCommandPalette,
// } from "./CommandPalette";
import { useResponsiveLayout } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AppHeaderProps {
  onRightSidebarToggle?: () => void;
  isRightSidebarOpen?: boolean;
}

export function AppHeader({ onRightSidebarToggle: _onRightSidebarToggle, isRightSidebarOpen: _isRightSidebarOpen = false }: AppHeaderProps) {
  const { shouldAutoCollapseSidebar } = useResponsiveLayout();
  const { open: sidebarOpen } = useSidebar();
  const [showAutoCollapseIndicator, setShowAutoCollapseIndicator] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Hidden for now: search bar / command palette (⌘K disabled)
  // const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  const shouldShowIndicator = shouldAutoCollapseSidebar && !sidebarOpen;

  useEffect(() => {
    if (shouldShowIndicator) {
      setShowAutoCollapseIndicator(true);
      const timer = setTimeout(() => {
        setShowAutoCollapseIndicator(false);
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setShowAutoCollapseIndicator(false);
    }
  }, [shouldShowIndicator]);

  // Quiet scroll-shadow: only show the bottom border + faint shadow once
  // content scrolls under the header (prototype `topbar[data-scrolled]`).
  useEffect(() => {
    const scrollArea = document.querySelector<HTMLElement>(
      "[data-main-content-area='true']",
    );
    if (!scrollArea) return;
    const onScroll = () => setScrolled(scrollArea.scrollTop > 4);
    onScroll();
    scrollArea.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollArea.removeEventListener("scroll", onScroll);
  });

  return (
    <header
      data-scrolled={scrolled}
      className="bg-[color-mix(in_srgb,var(--app-shell-surface)_82%,transparent)] text-foreground sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-[var(--app-shell-border)] backdrop-blur-md transition-[border-color,box-shadow] duration-(--motion-duration-slow) data-[scrolled=true]:border-(--color-border-subtle) data-[scrolled=true]:shadow-(--shadow-xs)"
    >
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />

        {/* Auto-collapse indicator */}
        {showAutoCollapseIndicator && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-foreground bg-muted/50 px-2 py-1 rounded-md">
                <Monitor className="h-3 w-3" />
                <span>Auto-collapsed</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sidebar auto-collapsed to prevent horizontal scrolling</p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1 min-w-0">
          <Breadcrumb />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Hidden for now: search bar / ⌘K command palette */}
          {/* <CommandSearchButton onClick={() => setPaletteOpen(true)} /> */}

          {/* Hidden for now: notifications */}
          {/* <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Notifications"
                    className="relative grid size-9 place-items-center rounded-md text-(--color-text-muted) transition-colors hover:bg-(--color-hover) hover:text-(--color-text)"
                  >
                    <Bell className="size-[18px]" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Notifications</p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b border-(--color-border-subtle) px-4 py-3">
                <p className="text-[13px] font-semibold text-(--color-text)">
                  Notifications
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <Bell className="size-5 text-(--color-text-subtle)" />
                <p className="text-[13px] font-medium text-(--color-text)">
                  You're all caught up
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  New activity and alerts will show up here.
                </p>
              </div>
            </PopoverContent>
          </Popover> */}

          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />

          {/* Theme toggle */}
          <ModeToggle />
        </div>
      </div>

      {/* Hidden for now: search bar / ⌘K command palette */}
      {/* <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> */}
    </header>
  );
}
