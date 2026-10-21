/**
 * ③ Tools and permissions on the Add MCP page. Lists the discovered tools
 * (GET /authsec/applications/:id/scope-matrix) with one suggested permission
 * per tool and the roles that hold it (GET /authsec/applications/:id/roles).
 *
 * Nothing is written here: the page's Save sends every change in ONE
 * PUT /authsec/applications/:id/tool-scope-map call (see `buildToolMappings`).
 */

import { useMemo, type Dispatch, type SetStateAction } from "react";

import { useGetScopeMatrixQuery } from "@/app/api/scopeMatrixApi";
import type {
  MCPToolResponse,
  OAuthScopeResponse,
  ScopeMatrixResponse,
  ToolScopeMapping,
} from "@/app/api/types/scopeMatrix";
import { useListRSRolesQuery } from "@/app/api/setupWizardApi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { Waiting } from "./SetupForm";
import { Notice } from "./WizardParts";
import { assignedScopes, suggestScopeForTool } from "./wizard-utils";

const BLOCKED = "__blocked__";

/** toolId → chosen scope id, or BLOCKED. Absent = keep the suggestion. */
export type ToolOverrides = Record<string, string>;

type Row = {
  tool: MCPToolResponse;
  /** Locked rows are shown but not changed by this page. */
  locked: string | null;
  defaultScopeId: string | null;
  reason: string;
};

const RISK_PILL: Record<OAuthScopeResponse["risk_level"], string> = {
  low: "bg-(--color-success-soft) text-(--color-success-text)",
  medium: "bg-(--color-warning-soft) text-(--color-warning-text)",
  high: "bg-(--color-danger-soft) text-(--color-danger-text)",
  critical: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

const RISK_DOT: Record<OAuthScopeResponse["risk_level"], string> = {
  low: "bg-(--color-success)",
  medium: "bg-(--color-warning)",
  high: "bg-(--color-danger)",
  critical: "bg-(--color-danger)",
};

function matrixScopes(matrix: ScopeMatrixResponse | undefined): OAuthScopeResponse[] {
  return matrix?.scopes ?? matrix?.unmapped_scopes ?? [];
}

function buildRow(tool: MCPToolResponse, scopes: OAuthScopeResponse[]): Row {
  const assigned = assignedScopes(tool);
  if (tool.is_public) {
    return { tool, locked: "Public: callable without a permission. Change it on the Tools tab.", defaultScopeId: null, reason: "" };
  }
  if (assigned.length > 1) {
    return {
      tool,
      locked: `${assigned.length} permissions already assigned. Edit them on the Tools tab.`,
      defaultScopeId: null,
      reason: "",
    };
  }
  if (assigned.length === 1) {
    return { tool, locked: null, defaultScopeId: assigned[0].scope_id, reason: "Already assigned." };
  }
  const suggestion = suggestScopeForTool(tool, scopes);
  return { tool, locked: null, defaultScopeId: suggestion.scopeId, reason: suggestion.reason };
}

function chosenScope(row: Row, overrides: ToolOverrides): string | null {
  const override = overrides[row.tool.id];
  if (override !== undefined) return override === BLOCKED ? null : override;
  return row.defaultScopeId;
}

/** Mappings to send on Save, skipping no-ops (AGENTS.md: one call, no no-ops). */
export function buildToolMappings(
  matrix: ScopeMatrixResponse | undefined,
  overrides: ToolOverrides,
): ToolScopeMapping[] {
  const scopes = matrixScopes(matrix);
  const mappings: ToolScopeMapping[] = [];
  for (const tool of matrix?.tools ?? []) {
    const row = buildRow(tool, scopes);
    if (row.locked) continue;
    const desired = chosenScope(row, overrides);
    const current = assignedScopes(tool).map((s) => s.scope_id);
    for (const scopeId of current) {
      if (scopeId !== desired) mappings.push({ tool_id: tool.id, scope_id: scopeId, remove: true });
    }
    if (desired && !current.includes(desired)) mappings.push({ tool_id: tool.id, scope_id: desired });
  }
  return mappings;
}

export function McpToolsSection({
  serverId,
  overrides,
  onOverridesChange,
  disabled,
}: {
  serverId: string | null;
  overrides: ToolOverrides;
  onOverridesChange: Dispatch<SetStateAction<ToolOverrides>>;
  disabled: boolean;
}) {
  const { data: matrix, isLoading, isError, refetch } = useGetScopeMatrixQuery(serverId ?? "", { skip: !serverId });
  const { data: rolesData } = useListRSRolesQuery(serverId ?? "", { skip: !serverId });

  const scopes = useMemo(() => matrixScopes(matrix), [matrix]);
  const scopesById = useMemo(() => new Map(scopes.map((s) => [s.id, s])), [scopes]);
  const rows = useMemo(() => (matrix?.tools ?? []).map((tool) => buildRow(tool, scopes)), [matrix?.tools, scopes]);
  const roles = useMemo(() => rolesData?.roles ?? [], [rolesData]);
  const defaultRole = roles.find((r) => r.is_default);

  if (!serverId) return <Waiting>Tools appear here once the server is checked.</Waiting>;
  if (isLoading) return <Notice tone="loading">Loading tools…</Notice>;
  if (isError) {
    return (
      <Notice
        tone="danger"
        title="Couldn't load tools."
        action={
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (rows.length === 0) {
    return (
      <Notice tone="info" title="No tools found yet.">
        If your server lists tools only through the AuthSec SDK, they appear after the SDK runs. You can then choose
        permissions on the Tools tab.
      </Notice>
    );
  }

  return (
    <>
      {scopes.length === 0 ? (
        <Notice tone="warning" title="This server has no permissions yet.">
          Every tool stays blocked. Add permissions on the Scopes tab after saving, then assign them on the Tools tab.
        </Notice>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-(--color-border-subtle)">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-(--color-surface-subtle)">
            <tr className="text-[length:13px] font-semibold text-(--color-text)">
              <th className="px-4 py-2.5">Tool</th>
              <th className="px-4 py-2.5">Description</th>
              <th className="px-4 py-2.5">Permission</th>
              <th className="px-4 py-2.5">Roles with it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const value = chosenScope(row, overrides);
              const scope = value ? scopesById.get(value) : undefined;
              const holders = scope ? roles.filter((r) => r.scopes?.includes(scope.scope_string)) : [];
              return (
                <tr key={row.tool.id} className="border-t border-(--color-border-subtle) align-middle">
                  <td className="px-4 py-3">
                    <code className="inline-block max-w-[220px] truncate rounded border border-(--color-border-subtle) bg-(--color-surface-subtle) px-1.5 py-0.5 font-mono text-[length:13px] text-(--color-text)">
                      {row.tool.name}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-[length:var(--font-size-sm)] text-(--color-text)">
                    {row.tool.title || row.tool.description || (
                      <span className="text-(--color-text-muted)">No description from the server.</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.locked ? (
                      <span className="text-[length:13px] text-(--color-text-muted)">{row.locked}</span>
                    ) : (
                      <Select
                        value={value ?? BLOCKED}
                        onValueChange={(next) => onOverridesChange((prev) => ({ ...prev, [row.tool.id]: next }))}
                        disabled={disabled || scopes.length === 0}
                      >
                        <SelectTrigger
                          aria-label={`Permission for ${row.tool.name}`}
                          title={overrides[row.tool.id] !== undefined ? "Your choice." : row.reason}
                          className={cn(
                            "h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 font-mono text-[length:13px] font-medium",
                            scope ? RISK_PILL[scope.risk_level] : "bg-(--color-surface-subtle) text-(--color-text-muted)",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={BLOCKED}>Blocked (no permission)</SelectItem>
                          {scopes.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="inline-flex items-center gap-2">
                                <span className={cn("size-1.5 rounded-full", RISK_DOT[s.risk_level])} aria-hidden />
                                <span className="font-mono text-[length:13px]">{s.scope_string}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[length:13px] text-(--color-text)">
                    {row.locked ? "—" : holders.length > 0 ? holders.map((r) => r.name).join(", ") : (
                      <span className="text-(--color-text-muted)">{scope ? "No role yet" : "Nobody"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-x-8 gap-y-2 text-[length:var(--font-size-sm)] sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-(--color-text)">Default role</dt>
        <dd className="font-semibold text-(--color-text)">{defaultRole?.name ?? "None"}</dd>
        <dt className="text-(--color-text)">Tools not listed</dt>
        <dd className="font-semibold text-(--color-text)">Blocked</dd>
      </dl>
      <p className="text-[length:13px] text-(--color-text-muted)">
        Each tool needs its permission. Roles hold permissions; change which role holds which on the Access tab after
        saving.
      </p>
    </>
  );
}
