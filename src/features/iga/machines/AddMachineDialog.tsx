/**
 * Add a machine: name it, and the console writes the commands to paste on it
 * (install authsec-cli, connect with a freshly minted ingest token, install
 * the daemon). Then it waits for the machine to register and links to it.
 *
 * Nothing is created before the machine registers: the machine IS its own
 * registration (a vm_sensor discovery source), so a machine that never runs
 * the commands leaves nothing behind but an unused ingest token.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  useListDiscoverySourcesQuery,
  useMintIngestTokenMutation,
} from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import config from "@/config";
import { ConnPill } from "@/features/iga/connections/ConnPill";
import { resolveWorkspaceId } from "@/utils/workspace";

import { CommandBlock, MUTED } from "./MachineParts";
import {
  connectedMachine,
  machineNameProblem,
  machineSetupCommands,
} from "./machinesModel";

const WAIT_POLL_MS = 5_000;

export function AddMachineDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [mintedAt, setMintedAt] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [mint, minting] = useMintIngestTokenMutation();

  const workspaceId = useMemo(() => {
    try {
      return resolveWorkspaceId() ?? "";
    } catch {
      return "";
    }
  }, []);
  const n = name.trim();
  const sources = useListDiscoverySourcesQuery(
    { kind: "vm_sensor" },
    { skip: !open, pollingInterval: token ? WAIT_POLL_MS : 0 },
  );
  const connected = token
    ? connectedMachine(sources.data, n, mintedAt)
    : undefined;
  const existing = !token ? connectedMachine(sources.data, n) : undefined;
  const problem =
    machineNameProblem(n) ??
    (workspaceId ? null : "Your session names no workspace. Sign in again.");

  const reset = () => {
    setName("");
    setToken(null);
    setMintedAt(undefined);
    setError(null);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };
  const create = async () => {
    setError(null);
    try {
      const r = await mint({ label: `machine:${n}` }).unwrap();
      setMintedAt(new Date().toISOString());
      setToken(r.token);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(
        status === 403
          ? "Your role cannot connect machines: it needs discovery:admin."
          : "The setup commands could not be created. Try again.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[88vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect a machine</DialogTitle>
          <DialogDescription>
            Install the AuthSec Agent Kit on a laptop, workstation or server.
            Its daemon finds the AI agents running there, reports them and what
            they do here, and applies the policies you save in the console. It
            connects outbound only.
          </DialogDescription>
        </DialogHeader>

        {!token ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="machine-name">Machine name</Label>
              <Input
                id="machine-name"
                value={name}
                placeholder="dev-laptop-01"
                className="font-mono text-xs"
                onChange={(e) => setName(e.target.value)}
              />
              <p className={`text-xs ${MUTED}`}>
                How the machine is shown in the console. Use one name per
                machine.
              </p>
              {existing ? (
                <p className="text-xs text-(--color-warning-text)">
                  A machine named {n} is already connected. Running the commands
                  on another machine adds a second one with the same name.
                </p>
              ) : null}
            </div>
            <ul className={`list-disc space-y-1 pl-5 text-xs ${MUTED}`}>
              <li>
                Linux (kernel 5.8+ for the eBPF sensor; older kernels and macOS
                poll the process table).
              </li>
              <li>
                Blocking and quarantine need the daemon to run as root with
                cgroup v2 and nftables; otherwise decisions are logged only.
              </li>
            </ul>
            {n && problem ? (
              <p className="text-xs text-(--color-warning-text)">{problem}</p>
            ) : null}
            {error ? (
              <p className="text-xs text-(--color-danger-text)">{error}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <CommandBlock
              label={`Run these on ${n}`}
              lines={machineSetupCommands({
                name: n,
                apiUrl: config.VITE_API_URL,
                workspaceId,
                ingestToken: token,
              })}
            />
            <p className={`text-xs ${MUTED}`}>
              They hold a new ingest token, shown only here: copy them now. The
              token is saved on the machine in /etc/authsec/connect.json
              (readable by root only).
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {connected ? (
                <>
                  <ConnPill tone="success">Connected</ConnPill>
                  <span>
                    {n} registered
                    {connected.agent_version
                      ? ` (authsec-cli ${connected.agent_version})`
                      : ""}
                    .{" "}
                    <Link
                      to={`/iga/machines/${encodeURIComponent(connected.id)}`}
                      onClick={close}
                      className="text-(--color-primary-text) hover:underline"
                    >
                      Open the machine
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <ConnPill tone="warning">Waiting for the machine</ConnPill>
                  <span className={MUTED}>
                    It appears here within seconds of the daemon starting.
                  </span>
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
              <Button
                onClick={() => void create()}
                disabled={!!problem || minting.isLoading}
              >
                {minting.isLoading ? "Creating…" : "Create setup commands"}
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
