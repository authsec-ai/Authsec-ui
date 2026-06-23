/**
 * ExternalServicesPage — Configure → Secrets. Rebuilt to the Console Refresh
 * prototype (`[data-cr]`): ConsolePage shell, ConsoleFilterBar, TableCard,
 * AdaptiveTable, kebab actions, prototype delete dialog. Wired to the real
 * external-services hooks.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Code2,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useGetExternalServicesQuery,
  useDeleteExternalServiceMutation,
  type RawExternalService,
} from "@/app/api/externalServiceApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";

const AUTH_TONE: Record<string, string> = {
  oauth2: "badge--info",
  api_key: "badge--success",
  bearer_token: "badge--info",
  basic_auth: "badge--warning",
  none: "badge--muted",
};
const AUTH_LABEL: Record<string, string> = {
  oauth2: "OAuth2",
  api_key: "API key",
  bearer_token: "Bearer token",
  basic_auth: "Basic auth",
  none: "None",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function ExternalServicesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetExternalServicesQuery();
  const [deleteService, deleteState] = useDeleteExternalServiceMutation();

  const [search, setSearch] = useState("");
  const [authFilter, setAuthFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<RawExternalService | null>(null);

  const services = useMemo<RawExternalService[]>(() => data ?? [], [data]);
  const authTypes = useMemo(() => Array.from(new Set(services.map((s) => s.auth_type))), [services]);

  const filters = useMemo(() => {
    return [
      { key: "all", label: "All auth types", count: services.length },
      ...authTypes.map((t) => ({
        key: t,
        label: AUTH_LABEL[t] ?? t,
        count: services.filter((s) => s.auth_type === t).length,
      })),
    ];
  }, [services, authTypes]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (authFilter !== "all" && s.auth_type !== authFilter) return false;
      if (!q) return true;
      return [s.name, s.url, s.type, s.description].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [services, search, authFilter]);

  const filtersActive = search.trim() !== "" || authFilter !== "all";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteService(deleteTarget.id).unwrap();
      toast.success(`Deleted "${deleteTarget.name}".`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to delete service.");
    }
  };

  const columns = useMemo<AdaptiveColumn<RawExternalService>[]>(
    () => [
      {
        id: "service",
        header: "Service",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.name}
            detail={row.original.url}
          />
        ),
      },
      {
        id: "type",
        header: "Type",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="badge badge--muted">
            <span className="bdot" />
            {row.original.type || "API"}
          </span>
        ),
      },
      {
        id: "auth",
        header: "Auth",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className={`badge ${AUTH_TONE[row.original.auth_type] ?? "badge--muted"}`}>
            <span className="bdot" />
            {AUTH_LABEL[row.original.auth_type] ?? row.original.auth_type}
          </span>
        ),
      },
      {
        id: "agent_access",
        header: "Agent access",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className={`badge ${row.original.agent_accessible ? "badge--success" : "badge--muted"}`}>
            <span className="bdot" />
            {row.original.agent_accessible ? "Enabled" : "Off"}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        priority: 4,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="time-cell">{formatDate(row.original.created_at)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ConsoleRowActions
              items={[
                {
                  label: "View docs",
                  icon: <Code2 className="size-4" />,
                  onSelect: () => window.open("https://docs.authsec.dev/getting-started", "_blank"),
                },
                {
                  label: "Delete service",
                  icon: <Trash2 className="size-4" />,
                  destructive: true,
                  onSelect: () => setDeleteTarget(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Secrets"
      description="Connect third-party services and manage their API credentials and secrets, accessible to your workloads and agents."
      actions={
        <Button className="text-white" onClick={() => navigate("/external-services/add")}>
          <Plus className="mr-1.5 size-3.5" /> Add service
        </Button>
      }
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search services by name, URL, or type"
        filters={filters}
        activeFilter={authFilter}
        onFilterChange={setAuthFilter}
      />

      <TableCard>
        <CardContent variant="flush">
          {isError ? (
            <div className="py-16 text-center">
              <span
                className="empty-ic"
                style={{
                  background: "var(--color-danger-soft)",
                  color: "var(--color-danger-text)",
                  borderColor: "transparent",
                }}
              >
                <KeyRound className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>
                Unable to load services
              </h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>
                We hit an error fetching external services and secrets.
              </p>
            </div>
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <KeyRound className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {filtersActive ? "No services match" : "No services yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {filtersActive
                  ? "Try a different search term or auth type."
                  : "Connect a third-party service to manage its credentials and expose it to your workloads."}
              </p>
              <div className="mt-4 flex justify-center">
                <Button
                  size="sm"
                  className="text-white"
                  onClick={
                    filtersActive
                      ? () => {
                          setSearch("");
                          setAuthFilter("all");
                        }
                      : () => navigate("/external-services/add")
                  }
                >
                  {filtersActive ? (
                    "Clear filters"
                  ) : (
                    <>
                      <Plus className="mr-1.5 size-3.5" /> Add service
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <AdaptiveTable
              tableId="external-services-inventory"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              onRowClick={() => window.open("https://docs.authsec.dev/getting-started", "_blank")}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleteState.isLoading && setDeleteTarget(null)}
      >
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon">
              <Trash2 className="icon" />
            </span>
            <DialogTitle className="dg-title">Delete service?</DialogTitle>
            <DialogDescription className="dg-desc">
              This removes the service and its stored credentials. Workloads relying on it lose
              access immediately. This can't be undone.
            </DialogDescription>
            {deleteTarget && <div className="dg-target">{deleteTarget.url}</div>}
            <div className="dg-actions">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteState.isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={deleteState.isLoading}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                {deleteState.isLoading ? "Deleting…" : "Delete service"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}

export default ExternalServicesPage;
