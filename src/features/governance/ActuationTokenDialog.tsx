/**
 * Mint an actuation token for a connector.
 *
 * The token is shown ONCE and stored only as a hash — losing it means re-minting,
 * which invalidates the old one. So this is a copy-once modal with an explicit
 * "I've saved this" acknowledgement gate before it can be dismissed.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  governanceError,
  useMintActuationTokenMutation,
} from "@/app/api/governanceApi";

export function ActuationTokenDialog({
  connectorId,
  connectorName,
  open,
  onOpenChange,
}: {
  connectorId: string;
  connectorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mint, { isLoading: saving }] = useMintActuationTokenMutation();

  const reset = () => {
    setNote("");
    setToken(null);
    setAcknowledged(false);
    setCopied(false);
  };

  const submit = async () => {
    try {
      const r = await mint({ connectorId, note: note.trim() || undefined }).unwrap();
      setToken(r.actuation_token);
    } catch (err) {
      toast.error(governanceError(err, "Could not mint an actuation token."));
    }
  };

  const closeGuarded = (next: boolean) => {
    // A minted-but-unacknowledged token must not be dismissed by accident.
    if (!next && token && !acknowledged) return;
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={closeGuarded}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint actuation token</DialogTitle>
          <DialogDescription>
            The agent for <span className="font-medium">{connectorName}</span> uses this token to
            authenticate when it pulls and applies governance decisions. It enforces quarantine in
            the cluster.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="space-y-3 py-2">
            <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
              <strong className="font-medium">Copy this now — it is shown once.</strong>{" "}
              <span className="text-foreground/80">
                It is stored only as a hash. If you lose it you must re-mint, which invalidates
                this one.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
                {token}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(token);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <label className="flex items-start gap-2 text-xs">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(c) => setAcknowledged(c === true)}
                className="mt-0.5"
              />
              <span>I&apos;ve saved this token somewhere secure. It won&apos;t be shown again.</span>
            </label>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="act-note">Note (optional)</Label>
              <Input
                id="act-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. rotated 2026-08 after cluster rebuild"
              />
              <p className="text-xs text-muted-foreground">
                Recorded with the token hash so you can tell tokens apart later.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {token ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!acknowledged}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="text-[length:var(--text-sm)] text-white"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? "Minting…" : "Mint token"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
