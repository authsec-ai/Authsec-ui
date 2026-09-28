/**
 * FindingsTable — lists ITDR findings with severity badges, status filters,
 * and drill-down to finding detail (TRD 2, WP-U1b).
 */

import { useEffect, useState } from "react";
import { type Finding, type FindingStatus, listFindings } from "./itdrApi";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-400 text-black",
  low: "bg-blue-400 text-white",
};

const STATUS_OPTIONS: FindingStatus[] = ["open", "acknowledged", "resolved", "false_positive"];

interface FindingsTableProps {
  onSelect?: (finding: Finding) => void;
}

export function FindingsTable({ onSelect }: FindingsTableProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [statusFilter, setStatusFilter] = useState<FindingStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listFindings(statusFilter || undefined)
      .then(setFindings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Threat Findings</h2>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FindingStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading findings...</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {!loading && findings.length === 0 && (
        <p className="text-sm text-gray-500">No findings found.</p>
      )}

      {!loading && findings.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2">Severity</th>
              <th className="py-2">Rule</th>
              <th className="py-2">Status</th>
              <th className="py-2">Outcome</th>
              <th className="py-2">Events</th>
              <th className="py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr
                key={f.id}
                className="cursor-pointer border-b hover:bg-gray-50"
                onClick={() => onSelect?.(f)}
              >
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[f.severity] ?? "bg-gray-200"}`}
                  >
                    {f.severity}
                  </span>
                </td>
                <td className="py-2">
                  <span className="font-medium">{f.rule_name}</span>
                  <span className="ml-1 text-xs text-gray-400">{f.rule_key}</span>
                </td>
                <td className="py-2">{f.status.replace("_", " ")}</td>
                <td className="py-2">{f.outcome}</td>
                <td className="py-2">{f.event_count}</td>
                <td className="py-2 text-xs text-gray-500">
                  {new Date(f.last_seen).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
