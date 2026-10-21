/**
 * /service-accounts — machine principals that call MCP servers with no person
 * signed in. Also listed on /agents; this page keeps the full management view.
 * Row click opens the drawer (edit, rotate secret, delete); there are no row menus.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Plus, Server } from "lucide-react";

import {
  useListWorkspaceServiceAccountsQuery,
  type WorkspaceServiceAccount,
} from "@/app/api/agentIdentityApi";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  DensityToggle,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { MetricStrip } from "@/components/console/MetricStrip";
import { TableCard } from "@/theme/components/cards";
import { ConsolePage } from "@/components/console/ConsolePage";
import { StatusBadge } from "@/components/console/status";

import { ServiceAccountDetail, ServiceAccountReach } from "./components/ServiceAccountDetail";
import { AUTH_METHOD_LABEL, SA_STATUS, authMethodOf, saStatusOf } from "./components/serviceAccountStatus";

const DOCS_URL = "https://docs.authsec.dev/getting-started";
const SMALL_TEXT = "text-[length:var(--font-size-body-xs)]";
const CREATE_URL = "/agents/new?type=service";

// ── Filter definitions ────────────────────────────────────────────────────────

type FilterKey = "all" | "credential" | "kubernetes" | "no_credential";

const FILTER_DEFS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "credential", label: "Client secret / JWT" },
  { key: "kubernetes", label: "Kubernetes" },
  { key: "no_credential", label: "No credential" },
];

function applyFilter(items: WorkspaceServiceAccount[], filter: FilterKey): WorkspaceServiceAccount[] {
  switch (filter) {
    case "credential":
      return items.filter((sa) => !!sa.oauth_client_id && !sa.spiffe_id);
    case "kubernetes":
      return items.filter((sa) => !!sa.spiffe_id);
    case "no_credential":
      return items.filter((sa) => !sa.oauth_client_id && !sa.spiffe_id);
    default:
      return items;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ServiceAccountsPage() {
  const { data, isLoading, refetch } = useListWorkspaceServiceAccountsQuery();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [selectedSA, setSelectedSA] = useState<WorkspaceServiceAccount | null>(null);

  const items = useMemo(() => {
    let list = applyFilter(data ?? [], activeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((sa) =>
        [sa.name, sa.description, sa.owner_email, sa.oauth_client_id, sa.spiffe_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [data, activeFilter, query]);

  const filtersWithCounts = useMemo<ConsoleFilterOption[]>(
    () =>
      FILTER_DEFS.map((f) => ({
        ...f,
        count:
          f.key === "all"
            ? (data ?? []).length
            : applyFilter(data ?? [], f.key as FilterKey).length,
      })),
    [data],
  );

  const metrics = useMemo(() => {
    const list = data ?? [];
    const active = list.filter((sa) => sa.status === "active").length;
    return { total: list.length, active, disabled: list.length - active };
  }, [data]);

  const columns = useMemo<AdaptiveColumn<WorkspaceServiceAccount>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="app-glyph">
              <Server className="size-4" />
            </span>
            <EntityCell
              label={<span className="font-semibold">{row.original.name}</span>}
              detail={row.original.oauth_client_id ?? row.original.spiffe_id}
            />
          </div>
        ),
      },
      {
        id: "auth",
        header: "Identity provider",
        priority: 3,
        approxWidth: 170,
        cell: ({ row }) => <span className="text-sm text-foreground">{AUTH_METHOD_LABEL[authMethodOf(row.original)]}</span>,
      },
      {
        id: "can_reach",
        header: "MCP access",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => <ServiceAccountReach saId={row.original.id} />,
      },
      {
        id: "status",
        header: "Status",
        priority: 2,
        approxWidth: 170,
        cell: ({ row }) => {
          const st = SA_STATUS[saStatusOf(row.original)];
          return (
            <StatusBadge tone={st.tone} className={SMALL_TEXT}>
              {st.label}
            </StatusBadge>
          );
        },
      },
      {
        id: "last_used",
        header: "Last used",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => {
          const ts = row.original.last_seen_at ? new Date(row.original.last_seen_at) : null;
          const valid = ts && !Number.isNaN(ts.getTime());
          return (
            <span className="text-sm text-muted-foreground">
              {valid ? formatDistanceToNow(ts, { addSuffix: true }) : "Never"}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      crumbs={[{ label: "Agents", to: "/agents" }, { label: "Service accounts" }]}
      title="Service accounts"
      description="Machine identities that call MCP servers with no person signed in, using a client secret, a private-key JWT or a Kubernetes token."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 size-3.5" />
              Docs
            </a>
          </Button>
          <Button asChild className="text-white">
            <Link to={CREATE_URL}>
              <Plus className="mr-1.5 size-3.5" />
              Create service account
            </Link>
          </Button>
        </>
      }
    >
      <MetricStrip
        aria-label="Service account counts"
        items={[
          { key: "total", label: "accounts", value: metrics.total, tone: "primary" },
          { key: "active", label: "active", value: metrics.active, tone: "success" },
          { key: "disabled", label: "disabled", value: metrics.disabled, tone: metrics.disabled > 0 ? "warning" : "neutral" },
        ]}
      />

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name, client ID, or owner"
        filters={filtersWithCounts}
        activeFilter={activeFilter}
        onFilterChange={(v) => setActiveFilter(v as FilterKey)}
        trailing={<DensityToggle />}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading service accounts…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <Server className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                {query || activeFilter !== "all"
                  ? "No service accounts match this filter."
                  : "No service accounts yet"}
              </p>
              {!query && activeFilter === "all" && (
                <>
                  <p className={`mx-auto mt-1 max-w-md text-muted-foreground ${SMALL_TEXT}`}>
                    Create a service account to get credentials for your server-to-server flows and
                    pick the MCP servers it can call, in one flow.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button size="sm" asChild className="text-white">
                      <Link to={CREATE_URL}>
                        <Plus className="mr-1.5 size-3.5" />
                        Create service account
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="service-accounts-inventory"
              data={items}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(sa) => sa.id}
              onRowClick={(sa) => setSelectedSA(sa)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <ServiceAccountDetail sa={selectedSA} onClose={() => setSelectedSA(null)} onChanged={() => void refetch()} />
    </ConsolePage>
  );
}
