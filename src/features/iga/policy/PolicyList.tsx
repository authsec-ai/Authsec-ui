/**
 * PolicyList — runtime policy administration console (TRD 2, WP-U1b).
 * Lists all runtime policies with lifecycle status and actions.
 */

import { useEffect, useState } from "react";
import { type RuntimePolicy, type PolicyLifecycle, listPolicies } from "./policyApi";

const LIFECYCLE_COLORS: Record<PolicyLifecycle, string> = {
  draft: "bg-gray-200 text-gray-800",
  validated: "bg-blue-100 text-blue-800",
  simulated: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  published: "bg-green-600 text-white",
  superseded: "bg-yellow-100 text-yellow-800",
  revoked: "bg-red-100 text-red-800",
};

interface PolicyListProps {
  onSelect?: (policy: RuntimePolicy) => void;
}

export function PolicyList({ onSelect }: PolicyListProps) {
  const [policies, setPolicies] = useState<RuntimePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listPolicies()
      .then(setPolicies)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Runtime Policies</h2>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading policies...</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {!loading && policies.length === 0 && (
        <p className="text-sm text-gray-500">No runtime policies configured.</p>
      )}

      {!loading && policies.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2">Name</th>
              <th className="py-2">Lifecycle</th>
              <th className="py-2">Revision</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b hover:bg-gray-50"
                onClick={() => onSelect?.(p)}
              >
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${LIFECYCLE_COLORS[p.lifecycle] ?? "bg-gray-100"}`}
                  >
                    {p.lifecycle}
                  </span>
                </td>
                <td className="py-2">v{p.current_draft_revision}</td>
                <td className="py-2 text-xs text-gray-500">
                  {new Date(p.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
