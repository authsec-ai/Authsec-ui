import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  CreditCard,
  Fingerprint,
  GlobeLock,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  Search,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface PaletteDestination {
  title: string;
  url: string;
  icon: LucideIcon;
  group: string;
  keywords?: string;
}

// Mirrors the AppSidebar IA so ⌘K routes to every primary destination.
const DESTINATIONS: PaletteDestination[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, group: "General" },
  { title: "Users", url: "/end-users", icon: Users, group: "Workspace", keywords: "end users people" },
  { title: "Applications", url: "/applications", icon: Layers, group: "Workspace", keywords: "apps clients mcp" },
  { title: "Roles", url: "/admin/access/roles", icon: UserCog, group: "Access control", keywords: "rbac" },
  { title: "Scopes", url: "/admin/access/scopes", icon: KeyRound, group: "Access control", keywords: "permissions" },
  { title: "Assignments", url: "/admin/access/assignments", icon: Link2, group: "Access control" },
  { title: "Audit Logs", url: "/logs/audit", icon: ClipboardList, group: "Monitor" },
  { title: "Identity Providers", url: "/identity-providers", icon: Fingerprint, group: "Configure", keywords: "auth methods oauth saml" },
  { title: "Trust Delegation", url: "/trust-delegation", icon: GlobeLock, group: "Configure" },
  { title: "Secrets", url: "/external-services", icon: KeyRound, group: "Configure", keywords: "external services" },
  { title: "SDK Guides", url: "/developer/sdk-guides", icon: BookOpen, group: "Configure" },
  { title: "Team", url: "/settings/team", icon: Users, group: "Settings" },
  { title: "Billing", url: "/admin/billing", icon: CreditCard, group: "Settings" },
];

const GROUP_ORDER = [
  "General",
  "Workspace",
  "Access control",
  "Monitor",
  "Configure",
  "Settings",
];

/** The quiet ⌘K search entry from the prototype topbar. */
export function CommandSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search (Command-K)"
      className="flex h-9 min-w-50 items-center gap-2 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-2.5 pl-3 text-[13px] text-(--color-text-subtle) transition-colors hover:border-(--color-border-strong) hover:bg-(--color-surface-raised) max-md:min-w-0"
    >
      <Search className="size-4 shrink-0" />
      <span className="flex-1 text-left max-md:hidden">Search…</span>
      <kbd className="rounded-[5px] border border-(--color-border-subtle) bg-(--color-surface-base) px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium text-(--color-text-muted) max-md:hidden">
        ⌘K
      </kbd>
    </button>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  const go = (url: string) => {
    onOpenChange(false);
    navigate(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search sections…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {GROUP_ORDER.map((group) => {
          const items = DESTINATIONS.filter((d) => d.group === group);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.title} ${item.keywords ?? ""}`}
                  onSelect={() => go(item.url)}
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
