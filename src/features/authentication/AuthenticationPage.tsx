/**
 * AuthenticationPage — Users → Identity providers. The workspace's OIDC and
 * SAML providers: who signs in through each, which MCP servers accept it, and
 * whether it is provisioned by SCIM. A row shows a button only when it needs
 * a decision (a provider that is turned off); edit, turn off and delete live
 * in the row's detail drawer. New providers are added on
 * /identity-providers/new.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Power, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar } from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import {
  CopyField,
  DetailGrid,
  DetailRow,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerSection,
} from "@/components/console/detail";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { TableCard } from "@/theme/components/cards";
import { toast } from "@/lib/toast";
import {
  useUpdateIdentityProviderStatusMutation,
  useDeleteIdentityProviderMutation,
} from "@/app/api/authMethodApi";
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { useListScimConnectionsQuery } from "@/app/api/scimConnectionsApi";
import { SessionManager } from "@/utils/sessionManager";
import { useTourStep, TOUR_REGISTRY } from "@/features/guided-tour";
import { ConnectIdpButton } from "@/features/end-users/ConnectIdpButton";
import { useSignInSources } from "@/features/end-users/signInSources";
import { useApplicationIdpPolicies } from "@/features/policies/useApplicationIdpPolicies";

import { useUnifiedProviders } from "./hooks/useUnifiedProviders";
import { providerEditPath } from "./utils/providerPaths";
import { ProviderIcon } from "./utils/provider-icons";
import type { UnifiedAuthProvider } from "./types";

type ProviderStatus = "active" | "no-sign-ins" | "off";

const STATUS_META: Record<ProviderStatus, { tone: string; label: string }> = {
  active: { tone: "badge--success", label: "Active" },
  "no-sign-ins": { tone: "badge--info", label: "No sign-ins yet" },
  off: { tone: "badge--muted", label: "Turned off" },
};

interface ProviderRow {
  provider: UnifiedAuthProvider;
  /** Directory users who sign in through it; null while unknown. */
  users: number | null;
  /** MCP server names that accept it; "all" when every MCP server does. */
  linked: string[] | "all";
  provisioning: "SCIM" | null;
  status: ProviderStatus;
}

export function AuthenticationPage() {
  const navigate = useNavigate();
  const workspaceId = SessionManager.getSession()?.workspace_id;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedAuthProvider | null>(null);

  useTourStep({ tourConfig: TOUR_REGISTRY["authentication-setup"] });

  const [updateProviderStatus, statusState] = useUpdateIdentityProviderStatusMutation();
  const [deleteProvider, { isLoading: isDeleting }] = useDeleteIdentityProviderMutation();

  const {
    providers,
    isLoading: isProvidersLoading,
    isError: hasProviderError,
    refetch: refetchProviders,
  } = useUnifiedProviders({ workspace_id: workspaceId || "" });

  const signIn = useSignInSources(workspaceId);
  const { data: scimConnections } = useListScimConnectionsQuery();
  const { data: mcpServers } = useListResourceServersQuery();
  const mcpIds = useMemo(() => (mcpServers ?? []).map((m) => m.id), [mcpServers]);
  const idpPolicies = useApplicationIdpPolicies(mcpIds);

  const allRows = useMemo<ProviderRow[]>(() => {
    const scimIdps = new Set(
      (scimConnections ?? [])
        .filter((c) => c.status === "active" && c.identity_provider_id)
        .map((c) => c.identity_provider_id as string),
    );
    return (providers ?? []).map((p) => {
      const users = signIn.loaded ? signIn.countByProvider.get(p.provider_name.toLowerCase()) ?? 0 : null;
      const accepting = (mcpServers ?? []).filter((m) => {
        const allowed = idpPolicies.byApp.get(m.id)?.allowed ?? null;
        return allowed === null || allowed.includes(p.idp_id);
      });
      const linked: ProviderRow["linked"] =
        mcpServers && accepting.length === mcpServers.length && mcpServers.length > 0
          ? "all"
          : accepting.map((m) => m.name);
      const status: ProviderStatus = !p.is_active ? "off" : users === 0 ? "no-sign-ins" : "active";
      return {
        provider: p,
        users,
        linked,
        provisioning: scimIdps.has(p.idp_id) ? "SCIM" : null,
        status,
      };
    });
  }, [providers, signIn, scimConnections, mcpServers, idpPolicies.byApp]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(({ provider: p }) => {
      if (typeFilter !== "all" && p.provider_type !== typeFilter) return false;
      if (!q) return true;
      return [p.display_name, p.provider_name, p.entity_id, p.callback_url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [allRows, search, typeFilter]);

  const selected = useMemo(
    () => allRows.find((r) => r.provider.id === selectedId) ?? null,
    [allRows, selectedId],
  );

  const filtersActive = search.trim() !== "" || typeFilter !== "all";

  // Every action addresses the identity_providers row by its UUID (idp_id).
  const setActive = useCallback(
    async (p: UnifiedAuthProvider, active: boolean) => {
      try {
        await updateProviderStatus({ id: p.idp_id, status: active ? "configured" : "disabled" }).unwrap();
        toast.success(`${p.display_name} ${active ? "turned on" : "turned off"}`);
        refetchProviders();
      } catch (error: unknown) {
        const e = error as { data?: { error?: string; message?: string } };
        toast.error(e?.data?.error || e?.data?.message || `Failed to update ${p.display_name}`);
      }
    },
    [updateProviderStatus, refetchProviders],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProvider(deleteTarget.idp_id).unwrap();
      toast.success(`${deleteTarget.display_name} deleted`);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      refetchProviders();
    } catch (error: unknown) {
      const e = error as { data?: { error?: string; message?: string } };
      toast.error(e?.data?.error || e?.data?.message || `Failed to delete ${deleteTarget.display_name}`);
    }
  };

  const typeFilters = useMemo(
    () => [
      { key: "all", label: "All", count: allRows.length },
      { key: "oidc", label: "OIDC", count: allRows.filter((r) => r.provider.provider_type === "oidc").length },
      { key: "saml", label: "SAML", count: allRows.filter((r) => r.provider.provider_type === "saml").length },
    ],
    [allRows],
  );

  const columns = useMemo<AdaptiveColumn<ProviderRow>[]>(
    () => [
      {
        id: "provider",
        header: "Identity provider",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => {
          const p = row.original.provider;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderIcon providerName={p.provider_name} providerType={p.provider_type} className="size-4 shrink-0" />
              <span className="truncate font-medium text-foreground" title={p.display_name}>
                {p.display_name}
              </span>
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Protocol",
        approxWidth: 90,
        priority: 2,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.provider.provider_type === "saml" ? "SAML" : "OIDC"}
          </span>
        ),
      },
      {
        id: "users",
        header: "Users",
        approxWidth: 70,
        priority: 3,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-foreground">{row.original.users ?? "—"}</span>
        ),
      },
      {
        id: "linked",
        header: "Linked MCPs",
        approxWidth: 260,
        priority: 4,
        cell: ({ row }) => {
          const { linked } = row.original;
          const text = linked === "all" ? "All MCPs" : linked.length ? linked.join(", ") : "–";
          return (
            <span className="block truncate text-sm text-foreground" title={text}>
              {text}
            </span>
          );
        },
      },
      {
        id: "provisioning",
        header: "Provisioning",
        approxWidth: 110,
        priority: 5,
        cell: ({ row }) => <span className="text-sm text-foreground">{row.original.provisioning ?? "–"}</span>,
      },
      {
        id: "status",
        header: "Status",
        approxWidth: 130,
        priority: 1,
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status];
          return (
            <span className={`badge ${meta.tone}`}>
              <span className="bdot" />
              {meta.label}
            </span>
          );
        },
      },
      {
        id: "action",
        header: "",
        alwaysVisible: true,
        approxWidth: 100,
        cell: ({ row }) =>
          row.original.status === "off" ? (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={statusState.isLoading}
                onClick={() => void setActive(row.original.provider, true)}
              >
                Turn on
              </Button>
            </div>
          ) : null,
      },
    ],
    [setActive, statusState.isLoading],
  );

  const sp = selected?.provider;

  return (
    <ConsolePage
      title="Identity providers"
      description="Where people sign in with their company account, such as Okta, Entra ID or Google, over OIDC or SAML."
      actions={<ConnectIdpButton />}
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search identity providers"
        filters={typeFilters}
        activeFilter={typeFilter}
        onFilterChange={setTypeFilter}
      />

      <TableCard>
        <CardContent variant="flush">
          {hasProviderError ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Unable to load identity providers. Please try refreshing.
            </div>
          ) : isProvidersLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {filtersActive ? "No identity providers match" : "No identity providers yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtersActive
                  ? "Try a different search term or filter."
                  : "Connect Okta, Entra ID, Google or any OIDC or SAML provider so your users can sign in."}
              </p>
              <div className="mt-4 flex justify-center">
                {filtersActive ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setTypeFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <ConnectIdpButton />
                )}
              </div>
            </div>
          ) : (
            <AdaptiveTable
              tableId="identity-providers"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.provider.id}
              onRowClick={(r) => setSelectedId(r.provider.id)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <RightDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        width={440}
        ariaTitle={sp ? `${sp.display_name} — identity provider` : "Identity provider"}
        ariaDescription="This identity provider's sign-in settings, users and the MCP servers that accept it."
      >
        {selected && sp ? (
          <>
            <DrawerHeader
              title={sp.display_name}
              subtitle={`${sp.provider_type === "saml" ? "SAML" : "OIDC"} · ${sp.provider_name}`}
              badge={
                <span className={`badge ${STATUS_META[selected.status].tone}`}>
                  <span className="bdot" />
                  {STATUS_META[selected.status].label}
                </span>
              }
            />
            <DrawerBody>
              <DrawerSection label="Overview">
                <DetailGrid>
                  <DetailRow label="Users" value={selected.users ?? "—"} />
                  <DetailRow label="Provisioning" value={selected.provisioning ?? "None"} />
                  <DetailRow
                    full
                    label="MCP servers that accept it"
                    value={
                      selected.linked === "all"
                        ? "All MCPs"
                        : selected.linked.length
                          ? selected.linked.join(", ")
                          : "None: every MCP server limits sign-in to other providers"
                    }
                  />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="Configuration">
                <DetailGrid>
                  {sp.provider_type === "saml" ? (
                    <>
                      {sp.entity_id ? <CopyField label="Entity ID" value={sp.entity_id} /> : null}
                      {sp.sso_url ? <CopyField label="Sign-in URL" value={sp.sso_url} /> : null}
                    </>
                  ) : sp.callback_url ? (
                    <CopyField label="Callback URL" value={sp.callback_url} />
                  ) : null}
                  <CopyField label="Provider ID" value={sp.idp_id} />
                </DetailGrid>
              </DrawerSection>
            </DrawerBody>
            <DrawerFooter>
              <Button className="text-white" onClick={() => navigate(providerEditPath(sp))}>
                <Pencil className="mr-1.5 size-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                disabled={statusState.isLoading}
                onClick={() => void setActive(sp, !sp.is_active)}
              >
                <Power className="mr-1.5 size-3.5" /> {sp.is_active ? "Turn off" : "Turn on"}
              </Button>
              <Button
                variant="outline"
                className="text-(--color-danger-text)"
                onClick={() => setDeleteTarget(sp)}
              >
                <Trash2 className="mr-1.5 size-3.5" /> Delete
              </Button>
            </DrawerFooter>
          </>
        ) : null}
      </RightDrawer>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !isDeleting && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Delete identity provider?</DialogTitle>
            <DialogDescription className="dg-desc">
              People who sign in through it can no longer sign in. This can't be undone.
            </DialogDescription>
            {deleteTarget?.display_name && (
              <div className="dg-target" style={{ fontFamily: "var(--font-family-sans)" }}>
                {deleteTarget.display_name}
              </div>
            )}
            <div className="dg-actions">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleConfirmDelete()} disabled={isDeleting}>
                <Trash2 className="mr-1.5 size-4" />
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
