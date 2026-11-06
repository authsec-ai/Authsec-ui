/** Shared bits of the model provider screens: labels, status chip and the three write dialogs. */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useConnectModelProviderMutation,
  useRevokeModelProviderMutation,
  useRotateModelProviderMutation,
  type ModelProviderConnection,
  type ModelProviderName,
} from "@/app/api/igaAgentModelProvidersApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { chipButtonClass } from "../model";
import { ActionError } from "../parts";
import { useGwAction } from "../gateway/useGwAction";
import { providerText } from "./providerModel";


export function StatusChip({ status }: { status: string }) {
  const tone = status === "active" ? "success" : status === "error" ? "danger" : "neutral";
  const hint =
    status === "active" ? "Syncing normally." : status === "error" ? "The last sync failed; see the error on the connection." : "Revoked: the admin key was destroyed and nothing syncs.";
  return (
    <StatusBadge tone={tone} title={hint}>
      {status === "active" ? "Active" : status === "error" ? "Error" : status === "revoked" ? "Revoked" : status}
    </StatusBadge>
  );
}


/** The admin key field: a password input, cleared with the dialog, never rendered back. */
function KeyField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        Admin key
      </label>
      <Input id={id} type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste the organisation admin key" autoComplete="off" spellCheck={false} />
    </div>
  );
}

const KEY_NOTE =
  "This is an organisation-wide admin key: it can read every project's keys and usage in the organisation. It is stored in Vault, is never shown again, and AuthSec only uses it to read.";

export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<ModelProviderName>("openai");
  const [adminKey, setAdminKey] = useState("");
  const [name, setName] = useState("");
  const [connect, state] = useConnectModelProviderMutation();
  const act = useGwAction();

  const close = () => {
    setAdminKey("");
    setName("");
    state.reset();
    act.clear();
    onClose();
  };
  const go = async () => {
    const res = await act.run(() => connect({ provider, admin_key: adminKey.trim(), display_name: name.trim() || undefined }));
    if (res) {
      toast.success("Organisation connected. The first sync is queued.");
      close();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a model provider organisation</DialogTitle>
          <DialogDescription>Opt in to see which keys in your OpenAI or Anthropic organisation are in use and whether AuthSec can account for them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span id="mp-provider-label" className="text-[13px] font-medium">
              Provider
            </span>
            <div role="radiogroup" aria-labelledby="mp-provider-label" className="flex gap-1.5">
              {(["openai", "anthropic"] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={provider === p} onClick={() => setProvider(p)} className={chipButtonClass(provider === p)}>
                  {providerText(p)}
                </button>
              ))}
            </div>
          </div>
          <KeyField id="mp-admin-key" value={adminKey} onChange={setAdminKey} />
          <div className="space-y-1.5">
            <label htmlFor="mp-display-name" className="text-[13px] font-medium">
              Name (optional)
            </label>
            <Input id="mp-display-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the provider and organisation name" autoComplete="off" />
          </div>
          <p className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">{KEY_NOTE}</p>
          <ActionError failure={act.failure} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || !adminKey.trim()}>
            {act.pending ? "Checking the key…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RotateDialog({ conn, onClose }: { conn: ModelProviderConnection | null; onClose: () => void }) {
  const [adminKey, setAdminKey] = useState("");
  const [rotate, state] = useRotateModelProviderMutation();
  const act = useGwAction();
  useEffect(() => {
    setAdminKey("");
    act.clear();
    // Only opening or switching connection resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.id]);
  if (!conn) return null;
  const close = () => {
    setAdminKey("");
    state.reset();
    act.clear();
    onClose();
  };
  const go = async () => {
    const res = await act.run(() => rotate({ id: conn.id, admin_key: adminKey.trim() }));
    if (res) {
      toast.success("Admin key replaced. The old key was destroyed.");
      close();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rotate the admin key</DialogTitle>
          <DialogDescription>
            Replace the key for {conn.display_name}. The new key must belong to the same organisation. The old key is destroyed in Vault.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <KeyField id="mp-rotate-key" value={adminKey} onChange={setAdminKey} />
          <p className="text-xs text-(--color-text-muted)">{KEY_NOTE}</p>
          <ActionError failure={act.failure} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || !adminKey.trim()}>
            {act.pending ? "Checking the key…" : "Rotate key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeDialog({ conn, onClose, onRevoked }: { conn: ModelProviderConnection | null; onClose: () => void; onRevoked?: () => void }) {
  const [revoke] = useRevokeModelProviderMutation();
  const act = useGwAction();
  useEffect(() => {
    act.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.id]);
  if (!conn) return null;
  const go = async () => {
    const res = await act.run(() => revoke({ id: conn.id }));
    if (res) {
      toast.success("Connection revoked. The admin key was destroyed.");
      onClose();
      onRevoked?.();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {conn.display_name}?</DialogTitle>
          <DialogDescription>
            The admin key is destroyed in Vault and syncing stops. Open unaccounted-usage findings for this organisation are resolved. Already collected keys and usage stay. To watch the organisation again, connect it with an admin key.
          </DialogDescription>
        </DialogHeader>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant="destructive" className="text-white" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Revoking…" : "Revoke and destroy key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
