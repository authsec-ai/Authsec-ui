/**
 * Connect a Kubernetes cluster: name it, and the console writes the one
 * command to paste (k8sSetup.ts) -- the published chart, the control plane's
 * API, the workspace and a freshly minted ingest token already in it. Then it
 * waits for the cluster's agent to register and links to the new connection.
 *
 * Nothing is created before the agent registers: the connection IS the
 * agent's own registration, so a cluster that never runs the command leaves
 * nothing behind but an unused ingest token (Discovery > ingest tokens).
 */

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useListDiscoverySourcesQuery, useMintIngestTokenMutation } from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import config from "@/config";
import { copyToClipboard } from "@/lib/clipboard";
import { resolveWorkspaceId } from "@/utils/workspace";

import { ConnPill } from "./ConnPill";
import { clusterNameProblem, connectedSource, enforceProblem, k8sSetupCommand } from "./k8sSetup";

const MUTED = "text-(--color-text-muted)";
const WAIT_POLL_MS = 5_000;

export function K8sSetupDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [clusterName, setClusterName] = useState("");
  const [enforce, setEnforce] = useState("");
  const [accessGraph, setAccessGraph] = useState(true);
  const [resync, setResync] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mint, minting] = useMintIngestTokenMutation();

  const workspaceId = useMemo(() => {
    try {
      return resolveWorkspaceId() ?? "";
    } catch {
      return "";
    }
  }, []);
  const name = clusterName.trim();
  const sources = useListDiscoverySourcesQuery({ kind: "k8s_webhook" }, { skip: !open, pollingInterval: token ? WAIT_POLL_MS : 0 });
  const connected = token ? connectedSource(sources.data, name) : undefined;
  const existing = !token ? connectedSource(sources.data, name) : undefined;
  const problem = clusterNameProblem(name) ?? enforceProblem(enforce) ?? (workspaceId ? null : "Your session names no workspace. Sign in again.");

  const reset = () => {
    setClusterName("");
    setEnforce("");
    setAccessGraph(true);
    setResync(true);
    setToken(null);
    setError(null);
    setCopied(false);
  };

  const create = async () => {
    setError(null);
    try {
      const r = await mint({ label: `k8s:${name}` }).unwrap();
      setToken(r.token);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(status === 403 ? "Your role cannot connect clusters: it needs discovery:admin." : "The setup command could not be created. Try again.");
    }
  };

  const close = () => {
    if (connected) onCreated();
    reset();
    onOpenChange(false);
  };

  const command = token
    ? k8sSetupCommand({ clusterName: name, controlPlaneUrl: config.VITE_API_URL, workspaceId, ingestToken: token, accessGraph, resync, enforceNamespaces: enforce })
    : "";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect a Kubernetes cluster</DialogTitle>
          <DialogDescription>
            Run one command in the cluster. It installs AuthSec's agent, which connects outbound and registers the cluster here. AuthSec
            never holds cluster credentials.
          </DialogDescription>
        </DialogHeader>

        {!token ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="k8s-name">Cluster name</Label>
              <Input id="k8s-name" value={clusterName} placeholder="prod-eks-us-east" className="font-mono text-xs" onChange={(e) => setClusterName(e.target.value)} />
              <p className={`text-xs ${MUTED}`}>
                Stable and unique per cluster: it names the connection and is part of every agent's identity. Reusing one merges two clusters'
                inventories.
              </p>
              {existing ? (
                <p className="text-xs text-(--color-warning-text)">
                  A cluster named {name} is already connected. The command for it re-installs and upgrades its agent.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="k8s-enforce">Enforce in these namespaces (optional)</Label>
              <Input id="k8s-enforce" value={enforce} placeholder="e.g. agents ml-platform" className="font-mono text-xs" onChange={(e) => setEnforce(e.target.value)} />
              <p className={`text-xs ${MUTED}`}>
                Lets the agent quarantine agents here once you turn enforcement on for the cluster. Empty installs discovery only; you can add it
                later from the connection's Enforcement tab.
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={accessGraph} onChange={(e) => setAccessGraph(e.target.checked)} />
                Read the cluster's RBAC (the access graph, and what Kubernetes access policies act on)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={resync} onChange={(e) => setResync(e.target.checked)} />
                Sweep the workloads already running, not only new ones
              </label>
            </div>
            {name && problem ? <p className="text-xs text-(--color-warning-text)">{problem}</p> : null}
            {error ? <p className="text-xs text-(--color-danger-text)">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Run this with kubectl access to {name}</span>
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(command, "Command", { toastSuccess: false }).then((ok) => {
                      if (ok) setCopied(true);
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline"
                >
                  {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs leading-5">
                {command}
              </pre>
              <p className={`text-xs ${MUTED}`}>
                It holds a new ingest token, shown only here: copy it now. Needs Helm 3.8 or later. Re-running it later upgrades the agent.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {connected ? (
                <>
                  <ConnPill tone="success">Connected</ConnPill>
                  <span>
                    {name} registered{connected.agent_version ? ` (agent v${connected.agent_version})` : ""}.{" "}
                    <Link to={`/iga/connections/${encodeURIComponent(connected.id)}`} onClick={close} className="text-(--color-primary-text) hover:underline">
                      Open the connection
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <ConnPill tone="warning">Waiting for the cluster</ConnPill>
                  <span className={MUTED}>The connection appears here within a minute of the agent starting.</span>
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {!token ? (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => void create()} disabled={!!problem || minting.isLoading}>
                {minting.isLoading ? "Creating…" : "Create setup command"}
              </Button>
            </>
          ) : (
            <Button variant={connected ? "default" : "outline"} onClick={close}>
              {connected ? "Done" : "Close"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
