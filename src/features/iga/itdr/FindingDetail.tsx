/**
 * FindingDetail — detailed view of a single ITDR finding with response
 * plan management and escalation lease creation (TRD 2, WP-U1b).
 */

import { useEffect, useState } from "react";
import {
  type Finding,
  type ResponsePlan,
  getFinding,
  listResponsePlans,
  createResponsePlan,
  approveResponsePlan,
  updateFindingStatus,
} from "./itdrApi";

interface FindingDetailProps {
  findingId: string;
  onBack?: () => void;
}

export function FindingDetail({ findingId, onBack }: FindingDetailProps) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [responsePlans, setResponsePlans] = useState<ResponsePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([getFinding(findingId), listResponsePlans(findingId)])
      .then(([f, rps]) => {
        setFinding(f);
        setResponsePlans(rps);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [findingId]);

  const handleAcknowledge = async () => {
    if (!finding) return;
    await updateFindingStatus(finding.id, "acknowledged");
    loadData();
  };

  const handleResolve = async () => {
    if (!finding) return;
    await updateFindingStatus(finding.id, "resolved");
    loadData();
  };

  const handleCreatePlan = async () => {
    if (!finding) return;
    await createResponsePlan({
      finding_id: finding.id,
      reason: "Auto-generated response plan",
    });
    loadData();
  };

  const handleApprovePlan = async (planId: string) => {
    await approveResponsePlan(planId);
    loadData();
  };

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>;
  if (!finding) return <p className="text-sm text-gray-500">Finding not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            className="text-sm text-blue-600 hover:underline"
            onClick={onBack}
          >
            Back to list
          </button>
        )}
        <h2 className="text-lg font-semibold">Finding: {finding.rule_name}</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 rounded border p-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-gray-500">Severity</p>
          <p className="font-medium">{finding.severity}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Confidence</p>
          <p className="font-medium">{finding.confidence}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Status</p>
          <p className="font-medium">{finding.status.replace("_", " ")}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Outcome</p>
          <p className="font-medium">{finding.outcome}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Events</p>
          <p className="font-medium">{finding.event_count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">First seen</p>
          <p className="font-medium text-xs">{new Date(finding.first_seen).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Last seen</p>
          <p className="font-medium text-xs">{new Date(finding.last_seen).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Rule key</p>
          <p className="font-medium">{finding.rule_key}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {finding.status === "open" && (
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            onClick={handleAcknowledge}
          >
            Acknowledge
          </button>
        )}
        {(finding.status === "open" || finding.status === "acknowledged") && (
          <button
            className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
            onClick={handleResolve}
          >
            Resolve
          </button>
        )}
        <button
          className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
          onClick={handleCreatePlan}
        >
          Create response plan
        </button>
      </div>

      {/* Recommended response */}
      {finding.recommended_response && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-xs font-medium text-yellow-800">Recommended response</p>
          <p className="text-sm text-yellow-700">{finding.recommended_response}</p>
        </div>
      )}

      {/* Response plans */}
      <div>
        <h3 className="mb-2 font-semibold">Response plans</h3>
        {responsePlans.length === 0 ? (
          <p className="text-sm text-gray-500">No response plans.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2">Status</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Created</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {responsePlans.map((rp) => (
                <tr key={rp.id} className="border-b">
                  <td className="py-2">{rp.status}</td>
                  <td className="py-2">{rp.reason || "—"}</td>
                  <td className="py-2 text-xs text-gray-500">
                    {new Date(rp.created_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    {rp.status === "requested" && (
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => handleApprovePlan(rp.id)}
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Identities */}
      {finding.identities && finding.identities.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Affected identities</h3>
          <ul className="list-inside list-disc text-sm">
            {finding.identities.map((id) => (
              <li key={id.identity_account_id}>{id.identity_account_id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
