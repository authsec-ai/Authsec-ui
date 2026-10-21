/**
 * Policies → Authentication. Sign-in rules the backend enforces.
 *
 * Today that is one kind: approved identity providers per MCP server
 * (`/authsec/applications/:id/identity-providers`). With no entries an MCP
 * server accepts every identity provider; with entries it accepts only the
 * enabled ones. The toggle is the rule's state and its switch at once.
 *
 * Workspace MFA and session length have no backend setting, so they are not
 * listed.
 */

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
import { toast } from "@/lib/toast";
import { SessionManager } from "@/utils/sessionManager";
import {
  useAddApplicationIDPPolicyMutation,
  useRemoveApplicationIDPPolicyMutation,
} from "@/app/api/authMethodApi";
import { useListResourceServersQuery, type ResourceServer } from "@/app/api/resourceServersApi";
import { useUnifiedProviders } from "@/features/authentication/hooks/useUnifiedProviders";
import { useApplicationIdpPolicies, type AppIdpPolicies } from "./useApplicationIdpPolicies";

interface PolicyRow {
  id: string;
  mcp: ResourceServer;
  entry: AppIdpPolicies;
  enabled: boolean;
  /** Names of the providers on the list (enabled or not). */
  providerNames: string[];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function errorText(e: unknown, fallback: string): string {
  const err = e as { data?: { error?: string; message?: string } };
  return err?.data?.error || err?.data?.message || fallback;
}

export default function AuthenticationPoliciesPage() {
  const workspaceId = SessionManager.getSession()?.workspace_id;
  const { data: mcpServers, isLoading: mcpLoading } = useListResourceServersQuery();
  const { providers, isLoading: idpLoading } = useUnifiedProviders({ workspace_id: workspaceId || "" });
  const mcpIds = useMemo(() => (mcpServers ?? []).map((m) => m.id), [mcpServers]);
  const policies = useApplicationIdpPolicies(mcpIds);

  const [addPolicy] = useAddApplicationIDPPolicyMutation();
  const [removePolicy] = useRemoveApplicationIDPPolicyMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ mcpId: string | null } | null>(null);

  const idpName = useCallback(
    (id: string) => providers.find((p) => p.idp_id === id)?.display_name ?? "Deleted provider",
    [providers],
  );

  const rows = useMemo<PolicyRow[]>(
    () =>
      (mcpServers ?? []).flatMap((mcp) => {
        const entry = policies.byApp.get(mcp.id);
        if (!entry || entry.policies.length === 0) return [];
        return [
          {
            id: mcp.id,
            mcp,
            entry,
            enabled: entry.allowed !== null,
            providerNames: entry.policies.map((p) => idpName(p.identity_provider_id)),
          },
        ];
      }),
    [mcpServers, policies.byApp, idpName],
  );

  // An MCP server without a list yet can get one.
  const unrestricted = useMemo(
    () => (mcpServers ?? []).filter((m) => !rows.some((r) => r.id === m.id)),
    [mcpServers, rows],
  );
  const canAdd = unrestricted.length > 0 && providers.length > 0;

  const toggle = useCallback(
    async (row: PolicyRow, enabled: boolean) => {
      setBusyId(row.id);
      try {
        await Promise.all(
          row.entry.policies.map((p) =>
            addPolicy({ applicationId: row.id, identity_provider_id: p.identity_provider_id, enabled }).unwrap(),
          ),
        );
        toast.success(
          enabled
            ? `${row.mcp.name} now accepts only ${joinNames(row.providerNames)}.`
            : `${row.mcp.name} now accepts every identity provider.`,
        );
      } catch (e) {
        toast.error(errorText(e, "Failed to update the rule"));
      } finally {
        setBusyId(null);
      }
    },
    [addPolicy],
  );

  const columns = useMemo<AdaptiveColumn<PolicyRow>[]>(
    () => [
      {
        id: "policy",
        header: "Policy",
        alwaysVisible: true,
        approxWidth: 240,
        cell: () => <span className="font-medium text-foreground">Approved identity providers</span>,
      },
      {
        id: "applies",
        header: "Applies to",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => <span className="text-sm text-foreground">{row.original.mcp.name}</span>,
      },
      {
        id: "rule",
        header: "Rule",
        priority: 2,
        approxWidth: 300,
        cell: ({ row }) => {
          const text = `${joinNames(row.original.providerNames)} only`;
          return (
            <span className="block truncate text-sm text-foreground" title={text}>
              {text}
            </span>
          );
        },
      },
      {
        id: "enabled",
        header: "Enabled",
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={row.original.enabled}
              disabled={busyId === row.original.id}
              aria-label={`Approved identity providers on ${row.original.mcp.name}`}
              onCheckedChange={(v) => void toggle(row.original, v)}
            />
          </div>
        ),
      },
    ],
    [busyId, toggle],
  );

  const loading = mcpLoading || idpLoading || (mcpIds.length > 0 && policies.isLoading);

  return (
    <ConsolePage
      title="Authentication"
      description="Sign-in rules."
      actions={
        canAdd ? (
          <Button className="text-white" onClick={() => setEditing({ mcpId: null })}>
            <Plus className="mr-1.5 size-4" /> Add policy
          </Button>
        ) : undefined
      }
    >
      <TableCard>
        <CardContent variant="flush">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : policies.isError ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Unable to load sign-in rules. Please try refreshing.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">No sign-in rules yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {providers.length === 0
                  ? "Every MCP server accepts every identity provider. Connect an identity provider to limit which ones each MCP server accepts."
                  : "Every MCP server accepts every identity provider."}
              </p>
              {canAdd ? (
                <div className="mt-4 flex justify-center">
                  <Button className="text-white" onClick={() => setEditing({ mcpId: null })}>
                    <Plus className="mr-1.5 size-4" /> Add policy
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <AdaptiveTable
              tableId="authentication-policies"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              onRowClick={(r) => setEditing({ mcpId: r.id })}
            />
          )}
        </CardContent>
      </TableCard>

      <p className="text-[13px] text-muted-foreground">
        Require MFA and session length aren't listed: AuthSec has no workspace setting for them yet.
      </p>

      {editing ? (
        <ApprovedProvidersDialog
          key={editing.mcpId ?? "new"}
          mcpId={editing.mcpId}
          mcpChoices={editing.mcpId ? (mcpServers ?? []).filter((m) => m.id === editing.mcpId) : unrestricted}
          entry={editing.mcpId ? policies.byApp.get(editing.mcpId) : undefined}
          providers={providers.map((p) => ({ id: p.idp_id, name: p.display_name }))}
          onClose={() => setEditing(null)}
          onAdd={(applicationId, idpId) =>
            addPolicy({ applicationId, identity_provider_id: idpId, enabled: true }).unwrap()
          }
          onRemove={(applicationId, idpId) =>
            removePolicy({ applicationId, identityProviderId: idpId }).unwrap()
          }
        />
      ) : null}
    </ConsolePage>
  );
}

function ApprovedProvidersDialog({
  mcpId,
  mcpChoices,
  entry,
  providers,
  onClose,
  onAdd,
  onRemove,
}: {
  mcpId: string | null;
  mcpChoices: ResourceServer[];
  entry?: AppIdpPolicies;
  providers: { id: string; name: string }[];
  onClose: () => void;
  onAdd: (applicationId: string, idpId: string) => Promise<unknown>;
  onRemove: (applicationId: string, idpId: string) => Promise<unknown>;
}) {
  const [appId, setAppId] = useState<string>(mcpId ?? mcpChoices[0]?.id ?? "");
  const current = useMemo(
    () => new Set((entry?.policies ?? []).map((p) => p.identity_provider_id)),
    [entry],
  );
  const enabledNow = useMemo(
    () => new Set((entry?.policies ?? []).filter((p) => p.enabled).map((p) => p.identity_provider_id)),
    [entry],
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set(current));
  const [saving, setSaving] = useState(false);
  const mcpName = mcpChoices.find((m) => m.id === appId)?.name ?? "this MCP server";

  const save = async () => {
    if (!appId) return;
    setSaving(true);
    try {
      const toAdd = [...checked].filter((id) => !current.has(id) || !enabledNow.has(id));
      const toRemove = [...current].filter((id) => !checked.has(id));
      await Promise.all([
        ...toAdd.map((id) => onAdd(appId, id)),
        ...toRemove.map((id) => onRemove(appId, id)),
      ]);
      toast.success(
        checked.size
          ? `${mcpName} now accepts only the providers you picked.`
          : `${mcpName} now accepts every identity provider.`,
      );
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Failed to save the rule"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approved identity providers</DialogTitle>
          <DialogDescription>
            People can sign in to {mcpId ? mcpName : "the MCP server"} only through the providers you pick. Pick none
            to accept every provider.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {!mcpId ? (
            <div className="space-y-1.5">
              <Label htmlFor="idp-policy-mcp">MCP server</Label>
              <Select value={appId} onValueChange={setAppId}>
                <SelectTrigger id="idp-policy-mcp" className="h-9">
                  <SelectValue placeholder="Choose an MCP server" />
                </SelectTrigger>
                <SelectContent>
                  {mcpChoices.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-foreground">Identity providers</legend>
            {providers.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                <Checkbox
                  checked={checked.has(p.id)}
                  onCheckedChange={(v) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void save()} disabled={saving || !appId}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
