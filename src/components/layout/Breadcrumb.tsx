import { useLocation, Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "../../lib/utils";
import { useBreadcrumbTailValue } from "./breadcrumbTail";
import { HUBS } from "@/components/console/hubs";

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

/**
 * Breadcrumb navigation component
 *
 * Automatically generates breadcrumbs based on current route
 * and provides navigation context for users
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The grouped page a route is a tab of ("People" for /settings/team), or
 *  null. The tab itself is not repeated: the page's tab strip says it. */
export function hubCrumb(pathname: string): { label: string; href: string } | null {
  for (const hub of Object.values(HUBS)) {
    for (const tab of hub.tabs) {
      const paths = [tab.to, ...(tab.match ?? [])];
      if (paths.includes(pathname)) return { label: hub.title, href: hub.tabs[0].to };
    }
  }
  return null;
}

/** "Edit SAML provider" for /identity-providers/saml/edit/:id and the like;
 *  null for any other path. */
export function identityProviderCrumb(segments: string[]): string | null {
  if (segments[0] !== "identity-providers") return null;
  const [, kind, action] = segments;
  if (kind === "create" && segments.length === 2) return "New OIDC provider";
  if (kind !== "saml" && kind !== "oidc") return null;
  const protocol = kind.toUpperCase();
  if (action === "create") return `New ${protocol} provider`;
  if (action === "edit") return `Edit ${protocol} provider`;
  return null;
}

/**
 * `variant="page"`: the trail drawn in the page, directly above its content,
 * for consoles with no top bar (UX proposal: "One breadcrumb, or none").
 * It reads "Discovery / Workloads / name": no Home icon and no product crumb,
 * since the sidebar already says both; the last item is the page you are on.
 */
export function Breadcrumb({ variant = "header" }: { variant?: "header" | "page" } = {}) {
  const location = useLocation();
  const tail = useBreadcrumbTailValue();

  const getRouteSegments = (pathname: string): BreadcrumbItem[] => {
    const all = pathname.split("/").filter(Boolean);
    // An IGA object page names itself in its own breadcrumb, by the object's
    // name; the header stops at its list rather than showing a raw id.
    const objectAt = all[0] === "iga" ? all.findIndex((s) => UUID.test(s)) : -1;
    const segments = objectAt > 0 ? all.slice(0, objectAt) : all;
    const breadcrumbs: BreadcrumbItem[] = [
      { label: "Home", href: "/", current: pathname === "/" },
    ];

    const hub = hubCrumb(pathname);
    if (hub) {
      breadcrumbs.push({ label: hub.label, current: true });
      return breadcrumbs;
    }

    // An identity provider's create/edit pages sit under a protocol segment
    // that has no page of its own, and end in an id: name the page instead.
    const idp = identityProviderCrumb(all);
    if (idp) {
      breadcrumbs.push({ label: "Sign-in", href: "/identity-providers" });
      breadcrumbs.push({ label: idp, current: true });
      return breadcrumbs;
    }

    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      // Convert segment to readable label
      let label = segment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      // Handle special cases
      switch (segment) {
        case "admin":
          label = "Admin";
          break;
        case "enduser":
          label = "End-User";
          break;
        case "end-users":
          label = "User Identities";
          break;
        case "users":
          label = "Users";
          break;
        case "groups":
          label = "Groups";
          break;
        case "roles":
          label = "Roles";
          break;
        case "resources":
          label = "Resources";
          break;
        case "scopes":
          label = "Role and Scope Bindings";
          break;
        case "permissions":
          label = "Permissions";
          break;
     
        case "iga":
          label = "Agentic IGA";
          break;
        case "applications":
          label = "MCP servers";
          break;
        case "new":
          label = "New";
          break;
        case "profile":
          label = "Your profile";
          break;
        case "external-principals":
          label = "External principals";
          break;
        case "connections":
          label = pathname.startsWith("/iga/") ? "Accounts" : "Connections";
          break;
        case "discovery":
          label = "Discovery";
          break;
        case "estate":
          label = "Workloads";
          break;
        case "sightings":
          label = "Sightings";
          break;
        case "k8s":
          label = "Kubernetes";
          break;
        case "policy":
          label = "Policy";
          break;
        case "agents":
          label = "Agents & services";
          break;
        case "services":
          label = "Services";
          break;
        case "logs":
          // The IGA console's Logs destination, versus the authorization console's.
          label = pathname.startsWith("/iga/") ? "Logs" : "Event Logs";
          break;
        case "authentication":
          label = "Authentication Methods";
          break;
        case "identity-providers":
          label = "Identity Providers";
          break;
        case "create":
          label = "Create";
          break;
        case "edit":
          label = "Edit";
          break;
        case "discover":
          label = "Service Discovery";
          break;
        case "invite":
          label = "Invite Users";
          break;
        case "import":
          label = "Import Secrets";
          break;
        case "templates":
          label = "Role Templates";
          break;
      }

      const isContextSegment = index === 0 && (segment === "admin" || segment === "enduser");
      const isActionWithoutStandaloneRoute = segment === "edit";
      const shouldLink = !isLast && !isContextSegment && !isActionWithoutStandaloneRoute;

      breadcrumbs.push({
        label,
        href: shouldLink ? currentPath : undefined,
        current: isLast,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getRouteSegments(location.pathname);
  // An object page names itself: its list becomes a link — to the list as the
  // reader left it — and the object's own name follows. Every segment before
  // the name is a real link. The active tab is not repeated; the tabs say it.
  if (tail && (location.pathname === tail.path || location.pathname.startsWith(`${tail.path}/`))) {
    if (tail.list?.parent) {
      // Discovery › <list>: replaces the URL's own segments (IGA › Workloads),
      // which name a route, not where the reader came from. The console's own
      // "IGA" crumb stays, so an object page reads Home › IGA › Discovery ›
      // <list> › <object> like every other IGA page (X-01).
      const keep = breadcrumbs[1]?.label === "Agentic IGA" ? 2 : 1;
      breadcrumbs.splice(
        keep,
        breadcrumbs.length - keep,
        { label: tail.list.parent.label, href: tail.list.parent.href },
        { label: tail.list.label, href: tail.list.href },
      );
    } else {
      // The object's own segment, and anything after it (its tab, a sub-page),
      // is replaced by the tail: keep only the segments that precede it. An
      // object id that is not a UUID is still in the URL, so count, don't guess.
      const depth = tail.path.split("/").filter(Boolean).length - 1;
      if (depth >= 1 && breadcrumbs.length > depth + 1) breadcrumbs.length = depth + 1;
      const last = breadcrumbs[breadcrumbs.length - 1];
      if (last && last !== breadcrumbs[0]) {
        breadcrumbs[breadcrumbs.length - 1] = tail.list
          ? { label: tail.list.label, href: tail.list.href }
          : { ...last, href: tail.path.slice(0, tail.path.lastIndexOf("/")), current: false };
      }
    }
    breadcrumbs.push({ label: tail.label, current: true });
  }

  const isDashboard = location.pathname === "/" || location.pathname === "/dashboard";

  if (variant === "page") {
    const items = breadcrumbs.slice(1).filter((b) => b.label !== "Agentic IGA");
    if (items.length < 2) return null;
    return (
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-[13px] text-(--color-text-muted)"
      >
        {items.map((item, index) => (
          <span key={item.href ?? `${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {item.current || !item.href ? (
              <span aria-current={item.current ? "page" : undefined}>{item.label}</span>
            ) : (
              <Link
                to={item.href}
                className="text-(--color-primary-text) underline underline-offset-2 hover:decoration-2"
              >
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-foreground">
      <Link to="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-4 w-4" />
      </Link>

      {isDashboard ? (
        <div className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">Home</span>
        </div>
      ) : breadcrumbs.slice(1).map((item, index) => (
        <div key={item.href ?? `${item.label}-${index}`} className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          {item.current || !item.href ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link to={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * Custom breadcrumb component for specific pages
 */
interface CustomBreadcrumbProps {
  items: Array<{
    label: string;
    href?: string;
    current?: boolean;
  }>;
  className?: string;
}

export function CustomBreadcrumb({ items, className }: CustomBreadcrumbProps) {
  return (
    <nav
      className={cn("flex items-center space-x-1 text-sm text-foreground mb-6", className)}
    >
      <Link to="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-4 w-4" />
      </Link>

      {items.map((item, _index) => (
        <div key={_index} className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          {item.current || !item.href ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link to={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
