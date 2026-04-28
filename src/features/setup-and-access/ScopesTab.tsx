import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  useGetScopeMatrixQuery,
  useListResourceServerScopesQuery,
  useCreateResourceServerScopeMutation,
  useDeleteScopeMutation,
} from "../../app/api/scopeMatrixApi";
import type { OAuthScope, RiskLevel } from "../../app/api/types/scopeMatrix";

interface Props {
  rsId: string;
  /** Called whenever the wizard should refresh checklist + activation gates. */
  onChange?: () => void;
}

const RISK_OPTIONS: { value: RiskLevel; label: string; tone: string }[] = [
  { value: "low", label: "Low", tone: "bg-gray-100 text-gray-700" },
  { value: "medium", label: "Medium", tone: "bg-blue-100 text-blue-800" },
  { value: "high", label: "High", tone: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", tone: "bg-red-100 text-red-800" },
];

function riskTone(level: RiskLevel | undefined): string {
  return RISK_OPTIONS.find((r) => r.value === level)?.tone ?? "bg-gray-100 text-gray-600";
}

export function ScopesTab({ rsId, onChange }: Props) {
  const { data: scopes = [], isLoading } = useListResourceServerScopesQuery(rsId);
  // Scope matrix gives us per-tool scope mappings — we use it to compute the
  // "used by N tools" counter per scope without an extra round-trip.
  const { data: matrix } = useGetScopeMatrixQuery(rsId);
  const [createScope, { isLoading: creating }] = useCreateResourceServerScopeMutation();
  const [deleteScope] = useDeleteScopeMutation();

  // Form state for the inline create row.
  const [scopeString, setScopeString] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");

  // Derive a tool-count per scope from the matrix.
  const toolCountByScopeID = useMemo(() => {
    const m = new Map<string, number>();
    if (!matrix) return m;
    for (const tool of matrix.tools) {
      for (const s of tool.scopes ?? []) {
        // Only count admin_override (runtime-effective) — sdk_suggested is advisory.
        if (s.source && s.source !== "admin_override") continue;
        m.set(s.scope_id, (m.get(s.scope_id) ?? 0) + 1);
      }
    }
    return m;
  }, [matrix]);

  const handleCreate = async () => {
    const trimmed = scopeString.trim();
    if (!trimmed) {
      toast.error("Scope string is required");
      return;
    }
    try {
      await createScope({
        rsId,
        body: {
          scope_string: trimmed,
          display_name: displayName.trim() || trimmed,
          description: description.trim() || undefined,
          risk_level: riskLevel,
        },
      }).unwrap();
      toast.success(`Scope "${trimmed}" created`);
      setScopeString("");
      setDisplayName("");
      setDescription("");
      setRiskLevel("low");
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to create scope");
    }
  };

  const handleDelete = async (scope: OAuthScope) => {
    if (
      !window.confirm(
        `Delete scope "${scope.scope_string}"? Any tool mapping that uses this scope will also be removed.`,
      )
    ) {
      return;
    }
    try {
      await deleteScope(scope.id).unwrap();
      toast.success(`Scope "${scope.scope_string}" deleted`);
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to delete scope");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Step 3: Define scopes</h2>
        <p className="mt-1 text-sm text-gray-600">
          Scopes are the named permissions you'll attach to MCP tools. End-users
          see these on the consent screen and only the scopes they're granted
          flow into their access tokens.
        </p>
      </div>

      {/* Inline create form */}
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Create scope</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-700 mb-1">
              Scope string <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={scopeString}
              onChange={(e) => setScopeString(e.target.value)}
              placeholder="e.g. repos:read"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-700 mb-1">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="(defaults to scope string)"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block text-xs font-medium text-gray-700 mb-1">
              Description (shown on consent screen)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Read repository metadata, including private repos"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-700 mb-1">Risk level</span>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {RISK_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleCreate}
            disabled={creating || !scopeString.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Add scope"}
          </button>
        </div>
      </div>

      {/* Scope list */}
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {scopes.length} scope{scopes.length !== 1 ? "s" : ""} registered
          </h3>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading scopes…</div>
        ) : scopes.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No scopes yet. Add one above to start mapping tools.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {scopes.map((scope) => {
              const toolCount = toolCountByScopeID.get(scope.id) ?? 0;
              return (
                <li
                  key={scope.id}
                  className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-gray-900">
                        {scope.scope_string}
                      </code>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${riskTone(
                          scope.risk_level,
                        )}`}
                      >
                        {scope.risk_level}
                      </span>
                      {scope.is_auto_discovered && (
                        <span className="rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                          auto-discovered
                        </span>
                      )}
                    </div>
                    {scope.display_name && scope.display_name !== scope.scope_string && (
                      <div className="mt-0.5 text-xs text-gray-700">{scope.display_name}</div>
                    )}
                    {scope.description && (
                      <div className="mt-1 text-xs text-gray-500">{scope.description}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-gray-500">
                      used by <strong>{toolCount}</strong> tool{toolCount !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => handleDelete(scope)}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
