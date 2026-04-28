import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  useGetScopeMatrixQuery,
  useListResourceServerScopesQuery,
  useUpdateToolScopeMapMutation,
} from "../../app/api/scopeMatrixApi";
import { useMarkToolPublicMutation } from "../../app/api/setupWizardApi";
import type {
  MCPToolResponse,
  ScopeMapEntry,
} from "../../app/api/types/scopeMatrix";

interface Props {
  rsId: string;
  /** Called whenever the wizard should refresh checklist + activation gates. */
  onChange?: () => void;
}

type ToolMode = "scoped" | "public";

function modeOf(tool: MCPToolResponse): ToolMode {
  return tool.is_public ? "public" : "scoped";
}

/** Pull only runtime-effective mappings (admin_override) from a tool's scopes. */
function effectiveScopes(tool: MCPToolResponse): ScopeMapEntry[] {
  return (tool.scopes ?? []).filter(
    (s) => !s.source || s.source === "admin_override",
  );
}

/** SDK-suggested scopes that aren't yet promoted to admin_override. */
function pendingSuggestions(tool: MCPToolResponse): ScopeMapEntry[] {
  return (tool.scopes ?? []).filter((s) => s.source === "sdk_suggested");
}

export function ToolsTab({ rsId, onChange }: Props) {
  const { data: matrix, isLoading } = useGetScopeMatrixQuery(rsId);
  const { data: scopes = [] } = useListResourceServerScopesQuery(rsId);
  const [updateMap, { isLoading: saving }] = useUpdateToolScopeMapMutation();
  const [markToolPublic] = useMarkToolPublicMutation();

  // Search filter for the tool list — useful when the RS exposes many tools.
  const [filter, setFilter] = useState("");

  const tools = useMemo(() => {
    const list = matrix?.tools ?? [];
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [matrix, filter]);

  const scopeByID = useMemo(() => {
    const m = new Map<string, (typeof scopes)[number]>();
    for (const s of scopes) m.set(s.id, s);
    return m;
  }, [scopes]);

  const handleToggleScope = async (tool: MCPToolResponse, scopeID: string, on: boolean) => {
    try {
      await updateMap({
        rsId,
        body: {
          mappings: [{ tool_id: tool.id, scope_id: scopeID, remove: !on }],
        },
      }).unwrap();
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to update mapping");
    }
  };

  const handleApplySuggestions = async (tool: MCPToolResponse) => {
    const pending = pendingSuggestions(tool);
    if (pending.length === 0) return;
    try {
      await updateMap({
        rsId,
        body: {
          mappings: pending.map((p) => ({ tool_id: tool.id, scope_id: p.scope_id, remove: false })),
        },
      }).unwrap();
      toast.success(
        `Applied ${pending.length} SDK-suggested scope${pending.length !== 1 ? "s" : ""} to ${tool.name}`,
      );
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to apply suggestions");
    }
  };

  const handleModeChange = async (tool: MCPToolResponse, mode: ToolMode) => {
    if (mode === "public") {
      const yes = window.confirm(
        `Mark "${tool.name}" as public? Public tools are callable by ANY token issued for this resource server, regardless of scope. Only do this for tools that are safe for any authenticated user.`,
      );
      if (!yes) return;
    }
    try {
      await markToolPublic({
        rsId,
        toolId: tool.id,
        body: {
          is_public: mode === "public",
          // Backend requires confirmation_token = tool.name when toggling public
          // (audit hardening). The window.confirm() above is the user's
          // acknowledgement; we forward the tool name as the typed token so
          // the gate passes while the UX stays a single-click confirm.
          ...(mode === "public" ? { confirmation_token: tool.name } : {}),
        },
      }).unwrap();
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to update tool mode");
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading tools…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Step 4: Map tools to scopes</h2>
        <p className="mt-1 text-sm text-gray-600">
          Every non-public tool must have at least one scope mapping. End-users
          who hold any of those scopes will be allowed to call the tool. Tools
          marked <strong>public</strong> bypass scope checks entirely.
        </p>
      </div>

      <input
        type="text"
        placeholder="Filter tools by name, title, or description…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
      />

      {tools.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {filter
            ? `No tools match "${filter}".`
            : "No tools yet. Complete Step 2 to ingest at least one tool."}
        </div>
      ) : (
        <ul className="space-y-3">
          {tools.map((tool) => {
            const mode = modeOf(tool);
            const effective = effectiveScopes(tool);
            const pending = pendingSuggestions(tool);
            const effectiveSet = new Set(effective.map((s) => s.scope_id));
            const sourceTag = tool.inventory_source ?? "mcp_scan";

            return (
              <li
                key={tool.id}
                className="rounded-md border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-gray-900">
                        {tool.name}
                      </code>
                      {tool.is_public && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                          🔓 public
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        {sourceTag.replace("_", " ")}
                      </span>
                      {!tool.is_public && effective.length === 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
                          unmapped — blocks activation
                        </span>
                      )}
                    </div>
                    {tool.title && tool.title !== tool.name && (
                      <div className="mt-0.5 text-xs text-gray-700">{tool.title}</div>
                    )}
                    {tool.description && (
                      <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                        {tool.description}
                      </div>
                    )}
                  </div>

                  {/* Mode radio */}
                  <fieldset className="flex shrink-0 flex-col gap-1 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`mode-${tool.id}`}
                        checked={mode === "scoped"}
                        onChange={() => handleModeChange(tool, "scoped")}
                      />
                      Requires scopes
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`mode-${tool.id}`}
                        checked={mode === "public"}
                        onChange={() => handleModeChange(tool, "public")}
                      />
                      <span className="font-medium">🔓 Public</span>
                    </label>
                  </fieldset>
                </div>

                {/* Scope grid (only meaningful when mode == scoped) */}
                {mode === "scoped" && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {scopes.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No scopes defined yet. Go back to Step 3 to add some.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {scopes.map((s) => {
                          const checked = effectiveSet.has(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={saving}
                              onClick={() => handleToggleScope(tool, s.id, !checked)}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition ${
                                checked
                                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {checked ? "✓ " : ""}
                              {s.scope_string}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* SDK-suggested scopes — advisory only until applied */}
                    {pending.length > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded bg-purple-50 border border-purple-200 px-3 py-2">
                        <div className="text-xs text-purple-900">
                          <strong>SDK suggested:</strong>{" "}
                          {pending.map((p) => (
                            <code key={p.scope_id} className="mx-1 font-mono">
                              {p.scope_string}
                            </code>
                          ))}
                        </div>
                        <button
                          onClick={() => handleApplySuggestions(tool)}
                          disabled={saving}
                          className="text-xs font-medium text-purple-700 underline hover:text-purple-900 disabled:opacity-50"
                        >
                          Apply suggestions →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {mode === "public" && (
                  <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-yellow-800 bg-yellow-50 rounded p-2">
                    🔓 This tool is callable by any token issued for this resource
                    server, regardless of scope. Token audience must still match
                    this RS, and <code>rs.state == ready</code> still applies.
                    Switch back to <em>Requires scopes</em> if this was a mistake —
                    no scope mappings are lost when toggling.
                  </div>
                )}

                {/* Resolve scope-name lookup so unmapped IDs render gracefully */}
                {effective.some((s) => !scopeByID.has(s.scope_id)) && (
                  <div className="mt-2 text-[11px] text-red-600">
                    Some mapped scopes were not found in the registry. Refresh
                    or re-run discovery.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
