/**
 * ScimConnectionsPage — Configure → SCIM Connections.
 * Manage SCIM 2.0 provisioning tokens. Follows the same Console Refresh
 * pattern used by AuthenticationPage and ApplicationsPage (table-card, empty
 * state, skeleton loaders, dropdown actions, confirmation dialog).
 */

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { SCIM_IDP_INSTRUCTIONS } from "./scimIdpInstructions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "@/lib/toast";
import {
  useListScimConnectionsQuery,
  useCreateScimConnectionMutation,
  useRevokeScimConnectionMutation,
} from "@/app/api/scimConnectionsApi";
import config from "@/config";

const INFO_KEY = "scim_connections_info_dismissed_v1";

type ScimConnection = {
  id: string;
  status: string;
  created_at: string;
};

export default function ScimConnectionsPage() {
  const { data: connections = [], isLoading, isError } = useListScimConnectionsQuery(
    undefined,
    // Retry on every mount/navigation so a transient failure doesn't leave the
    // page stuck on a cached error until a full reload.
    { refetchOnMountOrArgChange: true },
  );
  const [createConnection, { isLoading: isCreating }] = useCreateScimConnectionMutation();
  const [revokeConnection, { isLoading: isRevoking }] = useRevokeScimConnectionMutation();
  const [newToken, setNewToken] = useState<{ token: string; endpoint: string } | null>(null);
  const [activeIdp, setActiveIdp] = useState<string>("okta");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null);
  const [query, setQuery] = useState("");
  const [infoDismissed, setInfoDismissed] = useState(() => {
    try { return localStorage.getItem(INFO_KEY) === "1"; } catch { return false; }
  });

  const dismissInfo = () => { setInfoDismissed(true); try { localStorage.setItem(INFO_KEY, "1"); } catch {} };

  const handleCreate = async () => {
    try {
      const result = await createConnection({}).unwrap();
      setNewToken({ token: result.token, endpoint: result.endpoint });
      toast.success("SCIM connection created");
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to create connection");
    }
  };

  const handleRevoke = async () => {
    if (!deleteTarget) return;
    try {
      await revokeConnection(deleteTarget.id).unwrap();
      toast.success("Connection revoked");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to revoke");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const safeConnections: ScimConnection[] = Array.isArray(connections) ? connections : [];
  const apiBase = config.VITE_API_URL || "";

  const rows = useMemo<ScimConnection[]>(() => {
    const q = query.toLowerCase();
    if (!q) return safeConnections;
    return safeConnections.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  }, [safeConnections, query]);

  const columns = useMemo<AdaptiveColumn<ScimConnection>[]>(
    () => [
      {
        id: "connection",
        header: "Connection",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => {
          const id = row.original.id ?? "";
          const created = row.original.created_at
            ? new Date(row.original.created_at)
            : null;
          const createdLabel =
            created && !Number.isNaN(created.getTime())
              ? created.toLocaleDateString()
              : "—";
          return (
            <EntityCell
              label={<code style={{ fontSize: 12 }}>{id ? `${id.slice(0, 12)}…` : "—"}</code>}
              detail={createdLabel}
            />
          );
        },
      },
      {
        id: "status",
        header: "Status",
        approxWidth: 120,
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <span className="badge badge--success">
              <span className="bdot" />
              Active
            </span>
          ) : (
            <span className="badge badge--danger">
              <span className="bdot" />
              Revoked
            </span>
          ),
      },
      {
        id: "endpoint",
        header: "SCIM Endpoint",
        approxWidth: 340,
        priority: 1,
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <span className="ctx-uri" style={{ maxWidth: 320 }}>
              <code style={{ fontSize: 11 }}>
                {apiBase}/authsec/uflow/scim/v2/c/{row.original.id}/Users
              </code>
            </span>
          ) : (
            <span style={{ color: "var(--color-text-muted)" }}>—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                label="Connection actions"
                items={[
                  {
                    label: "Copy endpoint",
                    icon: <Copy className="size-4" />,
                    onSelect: () =>
                      copyToClipboard(
                        `${apiBase}/authsec/uflow/scim/v2/c/${row.original.id}/Users`,
                      ),
                  },
                  {
                    label: "Revoke",
                    icon: <Trash2 className="size-4" />,
                    onSelect: () => setDeleteTarget({ id: row.original.id }),
                    destructive: true,
                  },
                ]}
              />
            </div>
          ) : null,
      },
    ],
    [apiBase],
  );

  return (
    <ConsolePage
      title="SCIM Connections"
      description="Manage SCIM 2.0 provisioning tokens for automated user sync from identity providers."
      actions={
        <Button className="text-white" onClick={handleCreate} disabled={isCreating}>
          <Plus className="size-4" />
          {isCreating ? "Creating…" : "New Connection"}
        </Button>
      }
    >
      {/* Token reveal banner */}
      {newToken && (
        <div className="decision-banner" style={{ alignItems: "flex-start", borderColor: "var(--color-success, #16a34a)" }}>
          <span className="db-icon"><Shield className="icon" style={{ color: "var(--color-success, #16a34a)" }} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="db-title">Connection created — copy the token now</p>
            <p className="db-text">This token will not be shown again. Store it securely.</p>

            <div style={{ marginTop: "var(--space-3)" }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Bearer Token</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: 12, background: "var(--color-bg-subtle)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>{newToken.token}</code>
                <Button variant="outline" size="sm" style={{ height: 32, padding: "0 10px", flex: "none" }} onClick={() => copyToClipboard(newToken.token)}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>

            <div style={{ marginTop: "var(--space-3)" }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>SCIM Endpoint</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: 12, background: "var(--color-bg-subtle)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>{newToken.endpoint}</code>
                <Button variant="outline" size="sm" style={{ height: 32, padding: "0 10px", flex: "none" }} onClick={() => copyToClipboard(newToken.endpoint)}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>

            {/* IdP paste instructions */}
            <div style={{ marginTop: "var(--space-5)", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-4)" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-2)" }}>
                Where to paste in your IdP
              </p>
              {/* Tab strip */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: "var(--space-3)" }} role="tablist" aria-label="Identity provider instructions">
                {Object.entries(SCIM_IDP_INSTRUCTIONS).map(([key, idp]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activeIdp === key}
                    aria-controls={`scim-idp-panel-${key}`}
                    id={`scim-idp-tab-${key}`}
                    onClick={() => setActiveIdp(key)}
                    className="btn"
                    style={{
                      height: 28,
                      padding: "0 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid",
                      borderColor: activeIdp === key ? "var(--color-primary)" : "var(--color-border)",
                      background: activeIdp === key ? "var(--color-primary-soft, color-mix(in srgb, var(--color-primary) 12%, transparent))" : "transparent",
                      color: activeIdp === key ? "var(--color-primary)" : "var(--color-text-muted)",
                      fontWeight: activeIdp === key ? 600 : 400,
                      cursor: "pointer",
                      transition: "background 0.1s, border-color 0.1s, color 0.1s",
                    }}
                  >
                    {idp.label}
                  </button>
                ))}
              </div>
              {/* Active IdP steps */}
              {Object.entries(SCIM_IDP_INSTRUCTIONS).map(([key, idp]) =>
                activeIdp === key ? (
                  <div
                    key={key}
                    id={`scim-idp-panel-${key}`}
                    role="tabpanel"
                    aria-labelledby={`scim-idp-tab-${key}`}
                    style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
                  >
                    {/* Field label hints */}
                    <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                      In <strong>{idp.label}</strong>, the endpoint field is called{" "}
                      <strong>"{idp.endpointFieldLabel}"</strong> and the token field is called{" "}
                      <strong>"{idp.tokenFieldLabel}"</strong>.
                      {idp.freeTierNote && (
                        <span> — {idp.freeTierNote}</span>
                      )}
                    </p>

                    {/* Steps */}
                    <ol style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {idp.steps.map((step, i) => (
                        <li key={i} style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                          {step}
                        </li>
                      ))}
                    </ol>

                    {/* Gotchas */}
                    {idp.gotchas.length > 0 && (
                      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-warning)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-2)" }}>
                          Common gotchas
                        </p>
                        <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                          {idp.gotchas.map((gotcha, i) => (
                            <li key={i} style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                              {gotcha}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null
              )}
            </div>

            <Button variant="outline" size="sm" style={{ height: 32, padding: "0 12px", marginTop: "var(--space-4)" }} onClick={() => setNewToken(null)}>
              Dismiss
            </Button>
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setNewToken(null)} style={{ flex: "none" }}>
            <X className="icon-sm" />
          </button>
        </div>
      )}

      {/* Info banner */}
      {!infoDismissed && !newToken && (
        <div className="decision-banner" style={{ alignItems: "flex-start" }}>
          <span className="db-icon"><Shield className="icon" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="db-title">SCIM provisioning setup</p>
            <p className="db-text">
              Connect your identity provider (Okta, Azure AD, OneLogin) to automatically
              provision and deprovision users in this workspace.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)", marginTop: "var(--space-3)" }}>
              {[
                "Automated user lifecycle",
                "Group-based access control",
                "Real-time deprovisioning",
              ].map((cap) => (
                <span key={cap} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  <CheckCircle2 className="icon-sm" style={{ color: "var(--color-primary)" }} />
                  {cap}
                </span>
              ))}
            </div>
            <a
              className="btn btn-secondary"
              href="https://docs.authsec.dev/scim"
              target="_blank"
              rel="noreferrer"
              style={{ height: 32, padding: "0 12px", marginTop: "var(--space-4)" }}
            >
              <ExternalLink className="icon-sm" /> Setup guide
            </a>
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={dismissInfo} style={{ flex: "none" }}>
            <X className="icon-sm" />
          </button>
        </div>
      )}

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search connections…"
      />

      <TableCard>
        <CardContent variant="flush">
          {isError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <Shield className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load connections</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>We hit an error fetching SCIM connections.</p>
            </div>
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 && !newToken ? (
            <div className="empty">
              <span className="empty-ic"><Shield className="icon-lg" /></span>
              <h3 className="empty-title">No SCIM connections</h3>
              <p className="empty-desc">Create a connection to start provisioning users automatically.</p>
              <Button className="text-white" onClick={handleCreate} disabled={isCreating}>
                <Plus className="size-4" /> Create first connection
              </Button>
            </div>
          ) : (
            <AdaptiveTable
              tableId="scim-connections"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              rowClassName={(row) => row.original.status !== "active" ? "opacity-50" : undefined}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !isRevoking && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Revoke SCIM connection?</DialogTitle>
            <DialogDescription className="dg-desc">
              Users provisioned via this token will no longer sync. This cannot be undone.
            </DialogDescription>
            <div className="dg-actions">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isRevoking}>Cancel</Button>
              <Button variant="destructive" onClick={handleRevoke} disabled={isRevoking}>
                <Trash2 className="size-4" /> {isRevoking ? "Revoking…" : "Revoke"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
