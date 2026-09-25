import { useLocation, Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "../../lib/utils";
import { useBreadcrumbTailValue } from "./breadcrumbTail";

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

export function Breadcrumb() {
  const location = useLocation();
  const tail = useBreadcrumbTailValue();

  const getRouteSegments = (pathname: string): BreadcrumbItem[] => {
    const all = pathname.split("/").filter(Boolean);
    // An IGA object page names itself in its own breadcrumb, by the object's
    // name; the header stops at its list rather than showing a raw id.
    const objectAt = all[0] === "iga" ? all.findIndex((s) => UUID.test(s)) : -1;
    const segments = objectAt > 0 ? all.slice(0, objectAt) : all;
    const breadcrumbs: BreadcrumbItem[] = [
      { label: "Dashboard", href: "/", current: pathname === "/" },
    ];

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
          label = "IGA";
          break;
        case "external-principals":
          label = "External principals";
          break;
        case "estate":
          label = "Agents & workloads";
          break;
        case "agents":
          label = "Agents Identities";
          break;
        case "services":
          label = "Services";
          break;
        case "vault":
          label = "Vault & Secrets";
          break;
        case "logs":
          label = "Event Logs";
          break;
        case "authentication":
          label = "Authentication Methods";
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
  // An object page names itself: its list becomes a link and the object's
  // own name follows it. The active tab is not repeated — the tabs say it.
  if (tail && (location.pathname === tail.path || location.pathname.startsWith(`${tail.path}/`))) {
    const last = breadcrumbs[breadcrumbs.length - 1];
    if (last && last !== breadcrumbs[0]) {
      breadcrumbs[breadcrumbs.length - 1] = tail.list
        ? { label: tail.list.label, href: tail.list.href }
        : { ...last, href: tail.path.slice(0, tail.path.lastIndexOf("/")), current: false };
    }
    breadcrumbs.push({ label: tail.label, current: true });
  }

  const isDashboard = location.pathname === "/" || location.pathname === "/dashboard";

  return (
    <nav className="flex items-center space-x-1 text-sm text-foreground">
      <Link to="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-4 w-4" />
      </Link>

      {isDashboard ? (
        <div className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">Dashboard</span>
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
