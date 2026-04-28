import { useEffect, useState } from "react";
import {
  useGetSDKManifestStatusQuery,
  useScanWithMCPTokenMutation,
  useCreateManualToolMutation,
} from "../../app/api/setupWizardApi";
import type { SDKManifestStatusResponse } from "../../app/api/setupWizardApi";
import toast from "react-hot-toast";

interface Props {
  rsId: string;
  toolCount: number;
  onRefresh: () => void;
}

type ActivePath = "sdk" | "scan" | "manual" | null;

export function ToolInventoryStep({ rsId, toolCount, onRefresh }: Props) {
  const [activePath, setActivePath] = useState<ActivePath>(null);
  const [scanToken, setScanToken] = useState("");
  const [manualToolName, setManualToolName] = useState("");
  const [manualToolDesc, setManualToolDesc] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  // RTK Query mutations (handle admin auth via baseApi).
  const [scanWithMCPToken, { isLoading: scanLoading }] = useScanWithMCPTokenMutation();
  const [createManualTool, { isLoading: manualSaving }] = useCreateManualToolMutation();

  // SDK manifest status — polls every 5s while this path is open.
  const { data: manifestStatus, refetch: refetchManifest } =
    useGetSDKManifestStatusQuery(rsId, {
      skip: activePath !== "sdk",
      pollingInterval: activePath === "sdk" ? 5000 : 0,
    });

  const hasNoTools = toolCount === 0;

  const handleAuthenticatedScan = async () => {
    if (!scanToken.trim()) {
      setScanError("Please paste a bearer token.");
      return;
    }
    setScanError(null);
    try {
      await scanWithMCPToken({ rsId, mcpToken: scanToken }).unwrap();
      toast.success("Scan complete");
      setScanToken(""); // never persist the token
      onRefresh();
    } catch (err) {
      // RTK Query surfaces fetch errors with status + data shape.
      const apiErr = err as { status?: number; data?: { error?: string } };
      if (apiErr?.status === 401) {
        setScanError(
          "AuthSec couldn't list tools with that token. The MCP server returned 401. Paste a fresh, unexpired token from the RS owner."
        );
      } else if (apiErr?.status === 403) {
        setScanError(
          "The token authenticated, but the MCP server returned 403 on tools/list. The token needs at least read access to the tool inventory."
        );
      } else if (apiErr?.status === 504 || apiErr?.status === 408) {
        setScanError(
          "AuthSec couldn't reach the MCP server within 30s. Check public_base_url and try again."
        );
      } else {
        setScanError(apiErr?.data?.error ?? "Scan failed. Check the public base URL and try again.");
      }
    }
  };

  const handleManualAdd = async () => {
    if (!manualToolName.trim()) return;
    try {
      await createManualTool({
        rsId,
        name: manualToolName,
        description: manualToolDesc,
      }).unwrap();
      toast.success(`Tool "${manualToolName}" added`);
      setManualToolName("");
      setManualToolDesc("");
      onRefresh();
    } catch (err) {
      const apiErr = err as { status?: number; data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to add tool");
    }
  };

  return (
    <div className="space-y-4">
      {/* Blocking error state */}
      {hasNoTools && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Activation is blocked.</strong> This Resource Server has no tools
          registered. Choose one of the three paths below to ingest at least one
          tool.
          <br />
          <span className="text-red-600">
            (If this RS truly exposes no MCP tools — for example, an OIDC-only
            service — that flow is not yet supported in this wizard; contact
            platform support.)
          </span>
        </div>
      )}

      {toolCount > 0 && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {toolCount} tool{toolCount !== 1 ? "s" : ""} registered.
        </div>
      )}

      {/* Path selector */}
      <div className="flex gap-2">
        {(["sdk", "scan", "manual"] as const).map((path) => (
          <button
            key={path}
            onClick={() => setActivePath(activePath === path ? null : path)}
            className={`rounded px-3 py-1.5 text-sm font-medium border ${
              activePath === path
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {path === "sdk"
              ? "A: SDK manifest"
              : path === "scan"
              ? "B: Authenticated scan"
              : "C: Manual entry"}
          </button>
        ))}
      </div>

      {/* Path A: SDK manifest */}
      {activePath === "sdk" && (
        <SDKManifestPanel rsId={rsId} status={manifestStatus ?? null} onRefresh={refetchManifest} />
      )}

      {/* Path B: Authenticated scan */}
      {activePath === "scan" && (
        <div className="space-y-3 border rounded-md p-4">
          <p className="text-sm text-gray-600">
            Paste a single-use bearer token. AuthSec will retry{" "}
            <code>tools/list</code> with that token. The token is <strong>never persisted</strong>.
          </p>
          <textarea
            className="w-full rounded border border-gray-300 p-2 text-sm font-mono"
            rows={3}
            placeholder="Bearer token..."
            value={scanToken}
            onChange={(e) => setScanToken(e.target.value)}
          />
          {scanError && (
            <p className="text-sm text-red-600">{scanError}</p>
          )}
          <button
            onClick={handleAuthenticatedScan}
            disabled={scanLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {scanLoading ? "Scanning…" : "Run authenticated scan"}
          </button>
        </div>
      )}

      {/* Path C: Manual entry */}
      {activePath === "manual" && (
        <div className="space-y-3 border rounded-md p-4">
          <p className="text-sm text-gray-600">
            Escape hatch for fully closed servers. Type tool names one at a time.
          </p>
          <input
            type="text"
            className="w-full rounded border border-gray-300 p-2 text-sm"
            placeholder="Tool name (e.g. list_repositories)"
            value={manualToolName}
            onChange={(e) => setManualToolName(e.target.value)}
          />
          <input
            type="text"
            className="w-full rounded border border-gray-300 p-2 text-sm"
            placeholder="Description (optional)"
            value={manualToolDesc}
            onChange={(e) => setManualToolDesc(e.target.value)}
          />
          <button
            onClick={handleManualAdd}
            disabled={manualSaving || !manualToolName.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {manualSaving ? "Adding…" : "Add tool"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── SDK Manifest Panel ──────────────────────────────────────────────────────────

interface SDKManifestPanelProps {
  rsId: string;
  status: SDKManifestStatusResponse | null;
  onRefresh: () => void;
}

function SDKManifestPanel({ status, onRefresh }: SDKManifestPanelProps) {
  const [lastPolled, setLastPolled] = useState<string>("");

  useEffect(() => {
    const tick = () => setLastPolled(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  if (!status) {
    return (
      <div className="border rounded-md p-4 text-sm text-gray-500">
        Loading manifest status…
      </div>
    );
  }

  return (
    <div className="border rounded-md p-4 space-y-3 text-sm">
      <p className="text-gray-600">
        The SDK manifest tab polls every 5 seconds while open.{" "}
        <button className="text-blue-600 underline" onClick={onRefresh}>
          Refresh now
        </button>
      </p>

      {status.never_seen && (
        <div className="rounded bg-yellow-50 border border-yellow-200 p-3 text-yellow-800">
          <strong>Never seen</strong> — AuthSec has never received a manifest
          from this RS's SDK. Last polled: {lastPolled}.
          <br />
          Deploy your MCP server with{" "}
          <code className="bg-yellow-100 px-1">PublishManifest: true</code> in
          the AuthSec SDK config.
        </div>
      )}

      {status.last_attempt && status.last_attempt.status !== "success" && (
        <div className="rounded bg-red-50 border border-red-200 p-3 text-red-800">
          <strong>Last attempt failed</strong> at{" "}
          {new Date(status.last_attempt.attempted_at).toLocaleString()} —{" "}
          {status.last_attempt.status.replace(/_/g, " ")}
          {status.last_attempt.reason && `: ${status.last_attempt.reason}`}
        </div>
      )}

      {status.last_success && (
        <div className="rounded bg-green-50 border border-green-200 p-3 text-green-800">
          <strong>Last seen</strong>:{" "}
          {new Date(status.last_success.attempted_at).toLocaleString()} —{" "}
          {status.last_success.tool_count ?? "?"} tools
          {status.last_success.manifest_version &&
            `, version ${status.last_success.manifest_version}`}
          {status.last_success.sdk_build_id &&
            ` (build ${status.last_success.sdk_build_id})`}
        </div>
      )}
    </div>
  );
}
