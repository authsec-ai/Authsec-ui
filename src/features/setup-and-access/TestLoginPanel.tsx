import { useState } from "react";
import toast from "react-hot-toast";

import { useTestLoginMutation } from "../../app/api/setupWizardApi";
import type { TestLoginResponse } from "../../app/api/setupWizardApi";

interface Props {
  rsId: string;
}

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800" },
    needs_setup: { label: "Needs setup", cls: "bg-yellow-100 text-yellow-800" },
    pending_scan: { label: "Pending scan", cls: "bg-gray-100 text-gray-700" },
    scan_failed: { label: "Scan failed", cls: "bg-red-100 text-red-800" },
  };
  const c = cfg[state] ?? { label: state, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function StatusRow({
  label,
  value,
  warn,
  ok,
}: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
  ok?: boolean;
}) {
  const tone = warn
    ? "text-red-700"
    : ok
      ? "text-emerald-700"
      : "text-gray-900";
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-b-0">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${tone}`}>{value}</span>
    </div>
  );
}

export function TestLoginPanel({ rsId }: Props) {
  const [testLogin, { isLoading, data, error, reset }] = useTestLoginMutation();

  const handleRun = async () => {
    try {
      await testLogin(rsId).unwrap();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Test login failed");
    }
  };

  // narrow the result type so the JSX can read fields safely
  const result = data as TestLoginResponse | undefined;
  const errMsg = (error as { data?: { error?: string } } | undefined)?.data?.error;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Test login</h2>
        <p className="mt-1 text-sm text-gray-600">
          Simulates the end-user OAuth path against this resource server and
          reports whether each layer (RS state, OAuth gate, SDK enforcement)
          would pass. No tokens are issued and no logs are emitted to the
          end-user audit trail.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={isLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "Running…" : data ? "Re-run test" : "Run test"}
        </button>
        {data && (
          <button
            onClick={() => reset()}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Clear result
          </button>
        )}
      </div>

      {errMsg && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errMsg}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Resource server */}
          <section className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Resource server</h3>
              <StateBadge state={result.resource_server.state} />
            </div>
            <StatusRow label="Name" value={result.resource_server.name} />
            <StatusRow label="ID" value={
              <code className="font-mono text-xs">{result.resource_server.id}</code>
            } />
            <StatusRow label="Status" value={result.resource_server.status} />
          </section>

          {/* OAuth gate */}
          <section className="rounded-md border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">OAuth gate</h3>
            <StatusRow
              label="Will accept end-user logins?"
              value={result.oauth.state === "ready" ? "Yes" : "No"}
              ok={result.oauth.state === "ready"}
              warn={result.oauth.state !== "ready"}
            />
            {result.oauth.ready_since && (
              <StatusRow
                label="Ready since"
                value={new Date(result.oauth.ready_since).toLocaleString()}
              />
            )}
            {result.oauth.state !== "ready" && (
              <div className="mt-2 rounded bg-yellow-50 border border-yellow-200 p-2 text-xs text-yellow-900">
                The consent handler will reject end-user logins with{" "}
                <code>service_not_yet_activated</code> until activation completes.
              </div>
            )}
          </section>

          {/* SDK enforcement */}
          <section className="rounded-md border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">SDK enforcement</h3>
            <StatusRow
              label="Policy state"
              value={<StateBadge state={result.sdk_enforcement.sdk_policy_state} />}
            />
            <StatusRow
              label="Tools served"
              value={result.sdk_enforcement.tool_count}
              ok={result.sdk_enforcement.tool_count > 0}
              warn={result.sdk_enforcement.tool_count === 0}
            />
            <StatusRow
              label="Unmapped non-public tools"
              value={result.sdk_enforcement.unmapped_tools}
              warn={result.sdk_enforcement.unmapped_tools > 0}
              ok={result.sdk_enforcement.unmapped_tools === 0}
            />
            {result.sdk_enforcement.unmapped_tools > 0 && (
              <div className="mt-2 rounded bg-red-50 border border-red-200 p-2 text-xs text-red-800">
                {result.sdk_enforcement.unmapped_tools} tool
                {result.sdk_enforcement.unmapped_tools !== 1 ? "s are" : " is"}{" "}
                neither public nor mapped. The SDK will deny them with
                insufficient_scope until they're mapped on Step 4.
              </div>
            )}
          </section>

          {/* Overall verdict */}
          {result.resource_server.state === "ready" &&
          result.oauth.state === "ready" &&
          result.sdk_enforcement.sdk_policy_state === "ready" &&
          result.sdk_enforcement.unmapped_tools === 0 ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✅ End-to-end ready — an end-user OAuth flow against this RS
              would issue a token and the SDK would serve the configured
              tool set.
            </div>
          ) : (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              ⚠️ At least one layer is not in the ready state. End-user logins
              will fail or be served with a partial tool set.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
