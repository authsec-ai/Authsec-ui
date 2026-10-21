/**
 * Building blocks for the Register agent page (AI agent, voice agent or
 * service account): the "Grant MCP Access" table and a labelled credential
 * value.
 *
 * Token-driven colors only (see src/components/console/status.tsx).
 */

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { Copy } from "lucide-react";

import { useListApplicationsQuery, type Application } from "@/app/api/applicationsApi";
import { useListRSRolesQuery, type RSRole } from "@/app/api/setupWizardApi";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { roleLabel } from "./wizard-utils";

// ── Credentials ───────────────────────────────────────────────────────────────

/** One labelled credential value. `display` masks a secret; Copy copies `value`. */
export function CredentialRow({
  label,
  value,
  display,
  what,
}: {
  label: string;
  value: string;
  display?: string;
  what?: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-[length:var(--font-size-sm)] text-(--color-text)">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 break-all font-mono text-[length:var(--font-size-sm)] text-(--color-text)">
          {display ?? value}
        </code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => void copyToClipboard(value, what ?? label)}
          className="flex size-7 flex-none items-center justify-center rounded-md border border-(--color-border-subtle) text-(--color-text-muted) transition-colors hover:text-(--color-text)"
        >
          <Copy className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── MCP + role picker ─────────────────────────────────────────────────────────

/** serverId → chosen roleId ("" until roles load). Absent = not selected. */
export type ServerRoleSelection = Record<string, string>;

function rolePermissions(role: RSRole | undefined): string {
  if (!role) return "—";
  if (role.scopes && role.scopes.length > 0) return role.scopes.join(" · ");
  return `${role.permissions} permission${role.permissions === 1 ? "" : "s"}`;
}

function ServerRoleRow({
  server,
  roleId,
  selected,
  disabled,
  onToggle,
  onRole,
  onRoleMeta,
}: {
  server: Application;
  roleId: string;
  selected: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onRole: (roleId: string) => void;
  onRoleMeta: (serverId: string, role: RSRole | undefined) => void;
}) {
  const { data, isFetching, isError } = useListRSRolesQuery(server.id, { skip: !selected });
  const roles = useMemo(() => data?.roles ?? [], [data]);
  const role = roles.find((r) => r.id === roleId);

  // Pre-pick the server's default role (or its only role) once roles load.
  useEffect(() => {
    if (!selected || roleId || roles.length === 0) return;
    const preferred = roles.find((r) => r.is_default) ?? (roles.length === 1 ? roles[0] : undefined);
    if (preferred) onRole(preferred.id);
  }, [selected, roleId, roles, onRole]);

  useEffect(() => {
    onRoleMeta(server.id, selected ? role : undefined);
  }, [server.id, selected, role, onRoleMeta]);

  const checkboxId = `srv-${server.id}`;
  return (
    <tr className="border-t border-(--color-border-subtle) align-middle">
      <td className="w-12 py-3 pl-4">
        <Checkbox
          id={checkboxId}
          checked={selected}
          disabled={disabled}
          onCheckedChange={(v) => onToggle(v === true)}
        />
      </td>
      <td className="py-3 pr-3">
        <label
          htmlFor={checkboxId}
          className={cn(
            "cursor-pointer text-[length:var(--font-size-sm)]",
            selected ? "font-semibold text-(--color-text)" : "text-(--color-text-muted)",
          )}
        >
          {server.name}
        </label>
      </td>
      <td className="py-3 pr-3">
        {!selected ? (
          <span className="text-[length:var(--font-size-sm)] text-(--color-text-muted)">Not selected</span>
        ) : isError ? (
          <span className="text-[length:var(--font-size-sm)] text-(--color-danger-text)">Couldn't load roles</span>
        ) : roles.length === 0 ? (
          <span className="text-[length:var(--font-size-sm)] text-(--color-text-muted)">
            {isFetching ? "Loading roles…" : "No roles on this MCP yet"}
          </span>
        ) : (
          <Select value={roleId} onValueChange={onRole} disabled={disabled}>
            <SelectTrigger className="h-8 w-[170px]" aria-label={`Role on ${server.name}`}>
              <SelectValue placeholder="Pick a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {roleLabel(r.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-[length:13px] text-(--color-text-muted)">
        {selected ? rolePermissions(role) : "—"}
      </td>
    </tr>
  );
}

/**
 * Pick MCPs and one role on each. Roles are read per MCP from
 * GET /authsec/applications/:id/roles (only for ticked rows).
 */
export function ServerRolePicker({
  value,
  onChange,
  onRoleMeta,
  disabled = false,
}: {
  value: ServerRoleSelection;
  onChange: Dispatch<SetStateAction<ServerRoleSelection>>;
  /** Reports the chosen role object per MCP (for summaries). */
  onRoleMeta: (serverId: string, role: RSRole | undefined) => void;
  disabled?: boolean;
}) {
  const { data: servers, isLoading, isError } = useListApplicationsQuery();

  if (isLoading) {
    return <p className="text-[length:var(--font-size-sm)] text-(--color-text-muted)">Loading MCPs…</p>;
  }
  if (isError) {
    return (
      <p role="alert" className="text-[length:var(--font-size-sm)] text-(--color-danger-text)">
        Couldn't load your MCPs. Reload the page to try again.
      </p>
    );
  }
  if (!servers || servers.length === 0) {
    return (
      <p className="text-[length:var(--font-size-sm)] text-(--color-text-muted)">
        No MCPs yet. You can register now and give access later from an MCP's page.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-border-subtle)">
      <table className="w-full min-w-[520px] text-left">
        <thead className="bg-(--color-surface-subtle)">
          <tr className="text-[length:13px] font-semibold text-(--color-text)">
            <th className="w-12 py-2.5 pl-4">
              <span className="sr-only">Selected</span>
            </th>
            <th className="py-2.5 pr-3">MCP</th>
            <th className="py-2.5 pr-3">Role</th>
            <th className="py-2.5 pr-4">Permissions</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <ServerRoleRow
              key={s.id}
              server={s}
              selected={s.id in value}
              roleId={value[s.id] ?? ""}
              disabled={disabled}
              onToggle={(on) =>
                onChange((prev) => {
                  const next = { ...prev };
                  if (on) next[s.id] = "";
                  else delete next[s.id];
                  return next;
                })
              }
              onRole={(roleId) => onChange((prev) => ({ ...prev, [s.id]: roleId }))}
              onRoleMeta={onRoleMeta}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
