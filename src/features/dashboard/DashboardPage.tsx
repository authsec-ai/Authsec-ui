/**
 * DashboardPage — Launchpad layout.
 *
 * Out: generic onboarding chrome (activation banner, setup tour list, SDK
 *      integration tiles, RBAC "Soon" placeholder, recent-activity feed).
 * In:  a single divided metric strip (Apps total / healthy / needs
 *      attention, End users, IdPs configured) + a 6-tile quick-start
 *      launchpad grid that lights up as each setup step completes.
 *
 * Plan: /Users/pc/.claude/plans/honestly-i-am-hell-unified-tide.md §0.2.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  FolderSync,
  Layers,
  PlugZap,
  Shield,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { useListEndUsersQuery } from "@/app/api/membershipApi";
import { useListIdentityProvidersQuery } from "@/app/api/authMethodApi";
import { useListScimConnectionsQuery } from "@/app/api/scimConnectionsApi";
import { useListSyncConfigsQuery } from "@/app/api/syncConfigsApi";
import { useListApplicationRolesQuery } from "@/app/api/accessApi";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";
import { ConsolePage } from "@/components/console/ConsolePage";
import { MetricStrip } from "@/components/console/MetricStrip";

/* ─────────────────────────────── tile primitives ─────────────────────────── */

interface QuickStartTileProps {
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
  done?: boolean;
}

function QuickStartTile({ icon: Icon, label, description, to, done }: QuickStartTileProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border border-t-[3px] bg-(--color-surface-raised) p-4 text-left shadow-(--shadow-xs) transition hover:shadow-(--shadow-md) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
        done ? "border-(--color-border-subtle) border-t-(--color-success)" : "border-(--color-border-subtle) border-t-(--color-primary)",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 flex-none items-center justify-center rounded-md",
            done
              ? "bg-(--color-success-soft) text-(--color-success-text)"
              : "bg-(--color-primary-soft) text-(--color-primary-text)",
          )}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <span className="text-sm font-semibold text-(--color-text)">{label}</span>
      </div>
      <p className="flex-1 text-xs leading-5 text-(--color-text-muted)">{description}</p>
      <div className="flex items-center justify-between gap-2 border-t border-(--color-border-subtle) pt-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            done
              ? "bg-(--color-success-soft) text-(--color-success-text)"
              : "bg-(--color-surface-subtle) text-(--color-text-muted)",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              done ? "bg-(--color-success)" : "bg-(--color-text-subtle)",
            )}
          />
          {done ? "Configured" : "Not set up"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-(--color-primary-text) transition-transform group-hover:translate-x-0.5">
          {done ? "Review" : "Set up"}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

/* ────────────────────────────────── page ────────────────────────────────── */

export function DashboardPage() {
  const navigate = useNavigate();

  // Hero metric sources — lightweight list queries already used elsewhere.
  const workspaceId = resolveWorkspaceId();
  const { data: applications = [] } = useListApplicationsQuery();
  const { data: endUsersResp } = useListEndUsersQuery(
    { workspaceId: workspaceId ?? "" },
    { skip: !workspaceId },
  );
  // NOTE: limit is not a supported param — the query returns all; we only use
  // the count downstream so the full list is fine.
  const { data: idps = [] } = useListIdentityProvidersQuery({});
  const { data: scimConns = [] } = useListScimConnectionsQuery();
  const { data: syncConfigs = [] } = useListSyncConfigsQuery({});
  const { data: appRoles } = useListApplicationRolesQuery();

  // Health derived client-side from ResourceServer.state. Backend can replace
  // this with /authsec/applications/health-summary when liveness ships.
  const { total, healthy, attention } = useMemo(() => {
    const list = Array.isArray(applications) ? applications : [];
    const t = list.length;
    const h = list.filter((a: { state?: string }) => a?.state === "ready").length;
    return { total: t, healthy: h, attention: t - h };
  }, [applications]);

  const totalEndUsers = useMemo(() => {
    const r = endUsersResp as
      | { total?: number; total_count?: number; count?: number; users?: unknown[] }
      | unknown[]
      | undefined;
    if (!r) return 0;
    if (Array.isArray(r)) return r.length;
    return r.total ?? r.total_count ?? r.count ?? (Array.isArray(r.users) ? r.users.length : 0);
  }, [endUsersResp]);

  const idpsConfigured = useMemo(
    () =>
      (Array.isArray(idps) ? idps : []).filter(
        (p: { status?: string }) => p?.status === "configured",
      ).length,
    [idps],
  );

  // "Done" predicates for quick-start tiles.
  const hasIdp = idpsConfigured > 0;
  const hasDirSync = (Array.isArray(syncConfigs) ? syncConfigs : []).some(
    (c: { is_active?: boolean }) => c?.is_active !== false,
  );
  const hasApplication = total > 0;
  const hasScim = (Array.isArray(scimConns) ? scimConns : []).some(
    (c: { status?: string }) => c?.status !== "revoked",
  );
  const hasClients = true; // always navigable
  const hasRole = Array.isArray(appRoles?.roles) ? appRoles.roles.length > 0 : false;

  const tiles: Array<QuickStartTileProps> = [
    {
      icon: Fingerprint,
      label: "Wire an identity provider",
      description:
        "Connect Auth0, Okta, Azure AD or another SAML/OIDC IdP for end-user logins.",
      to: "/identity-providers",
      done: hasIdp,
    },
    {
      icon: FolderSync,
      label: "Connect Directory Sync",
      description:
        "Import users from Active Directory or Entra ID on a schedule.",
      to: "/directory-sync",
      done: hasDirSync,
    },
    {
      icon: Layers,
      label: "Wrap your first MCP server",
      description:
        "Register an MCP application and protect it with AuthSec OAuth + scopes.",
      to: "/applications/new",
      done: hasApplication,
    },
    {
      icon: Shield,
      label: "Configure SCIM provisioning",
      description:
        "Let your IdP push user provisioning events to AuthSec via SCIM 2.0.",
      to: "/scim-connections",
      done: hasScim,
    },
    {
      icon: PlugZap,
      label: "Manage clients",
      description:
        "Review OAuth clients (agents, apps, M2M services) registered across the workspace.",
      to: "/clients",
      done: hasClients,
    },
    {
      icon: UserCog,
      label: "Define roles & scopes",
      description:
        "Build role-based access for the tools your MCP servers expose.",
      to: "/access/roles",
      done: hasRole,
    },
  ];

  const completedTiles = tiles.filter((t) => t.done).length;

  return (
    <ConsolePage
      title="Dashboard"
      description="Real counts across the workspace. Click any tile to jump to the section."
    >
      {/* Row 1 — metric strip */}
      <MetricStrip
        aria-label="Hero metrics"
        items={[
          { key: "apps", label: "applications", value: total, tone: "primary", onClick: () => navigate("/applications") },
          {
            key: "healthy",
            label: "healthy",
            value: healthy,
            tone: total > 0 && healthy === total ? "success" : "neutral",
            onClick: () => navigate("/applications"),
          },
          {
            key: "attention",
            label: "need a decision",
            value: attention,
            tone: attention > 0 ? "warning" : "neutral",
            onClick: () => navigate("/applications"),
          },
          { key: "end-users", label: "end users", value: totalEndUsers, tone: "primary", onClick: () => navigate("/end-users") },
          {
            key: "idps",
            label: "identity providers",
            value: idpsConfigured,
            tone: "neutral",
            onClick: () => navigate("/identity-providers"),
          },
        ]}
      />

      {/* Row 2 — quick-start tiles */}
      <section aria-label="Quick start">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--color-text)">Setup quick-starts</h2>
          <span className="text-xs text-(--color-text-muted)">
            {completedTiles} / {tiles.length} configured
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <QuickStartTile key={tile.to} {...tile} />
          ))}
        </div>
      </section>

      {/* Row 3 — reference links */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--color-border-subtle) pt-4 text-xs text-(--color-text-muted)">
        <a className="hover:text-(--color-text)" href="/logs/audit">
          Audit logs
        </a>
        <span aria-hidden>·</span>
        <a className="hover:text-(--color-text)" href="/settings/team">
          Team
        </a>
        <span aria-hidden>·</span>
        <a
          className="hover:text-(--color-text)"
          href="https://docs.authsec.dev"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>
      </footer>
    </ConsolePage>
  );
}
