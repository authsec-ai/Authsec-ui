import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  ClipboardList,
  Fingerprint,
  FolderSync,
  KeyRound,
  LayoutDashboard,
  Layers,
  Link2,
  PlugZap,
  Search,
  Server,
  Shield,
  ShieldCheck,
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

// Mirrors the AppSidebar IA exactly (see AppSidebar.tsx NAV_* arrays) so ⌘K
// routes to every service/section the sidebar advertises — same URLs, same
// icons, same grouping. Deliberately excludes routes the sidebar itself no
// longer links to (/external-services, /trust-delegation — see AppSidebar's
// header comment on why those were dropped from the IA).
const DESTINATIONS: PaletteDestination[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, group: "General" },
  { title: "Users", url: "/end-users", icon: Users, group: "Workspace", keywords: "end users identities people" },
  { title: "Applications", url: "/applications", icon: Layers, group: "Workspace", keywords: "apps mcp servers" },
  { title: "Service Accounts", url: "/service-accounts", icon: Server, group: "Workspace", keywords: "machine m2m" },
  { title: "Agents", url: "/agents", icon: Bot, group: "Workspace", keywords: "ai agents bots" },
  { title: "Clients", url: "/clients", icon: PlugZap, group: "Workspace", keywords: "oauth clients" },
  { title: "Roles", url: "/access/roles", icon: UserCog, group: "Authz", keywords: "rbac permissions" },
  { title: "Scopes", url: "/access/scopes", icon: KeyRound, group: "Authz", keywords: "permissions" },
  { title: "Assignments", url: "/access/assignments", icon: Link2, group: "Authz", keywords: "role bindings" },
  { title: "Auth Logs", url: "/logs/auth", icon: ShieldCheck, group: "Monitor", keywords: "sign-in authentication" },
  { title: "Audit Logs", url: "/logs/audit", icon: ClipboardList, group: "Monitor", keywords: "audit trail" },
  { title: "M2M Logs", url: "/logs/m2m", icon: PlugZap, group: "Monitor", keywords: "machine to machine" },
  { title: "Identity Providers", url: "/identity-providers", icon: Fingerprint, group: "Configure", keywords: "sso saml oidc idp" },
  { title: "SCIM Connections", url: "/scim-connections", icon: Shield, group: "Configure", keywords: "scim provisioning" },
  { title: "Directory Sync", url: "/directory-sync", icon: FolderSync, group: "Configure", keywords: "active directory entra ldap" },
  { title: "Team", url: "/settings/team", icon: Users, group: "Settings", keywords: "members" },
  { title: "Trusted Issuers", url: "/settings/trusted-issuers", icon: ShieldCheck, group: "Settings", keywords: "oidc issuers" },
];

const GROUP_ORDER = [
  "General",
  "Workspace",
  "Authz",
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
      <kbd className="rounded-[4px] border border-(--color-border-subtle) bg-(--color-surface-base) px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium text-(--color-text-muted) max-md:hidden">
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
