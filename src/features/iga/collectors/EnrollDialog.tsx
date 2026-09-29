/**
 * EnrollDialog — generate an enrollment token and a ready-to-paste
 * `docker run` command that bootstraps a host collector.
 *
 * Two visual states:
 *  1. **Configure** — pick collector kind + optional estate name, then generate.
 *  2. **Token ready** — copyable token, copyable docker command, countdown timer.
 *
 * The token is single-use, SHA-256 hashed server-side, and short-lived
 * (15 min by default). The countdown shows how long it remains valid.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Copy, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateEnrollmentTokenMutation,
  type CollectorKind,
  type IssuedEnrollment,
} from "@/app/api/collectorApi";

function errorMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) return "Your role is missing the discovery:admin permission.";
  if (status === 404) return "IGA_V2_INGEST is not enabled on this instance.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}

/** Seconds remaining until `expiresAt`, floored to zero. */
function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => void copy()}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

const KIND_LABELS: Record<CollectorKind, string> = {
  linux_collector: "Linux host collector",
  k8s_collector: "Kubernetes collector",
  node_sensor: "Node sensor",
};

function dockerCommand(token: string): string {
  const url = window.location.origin;
  return [
    "docker run -d --name authsec-collector --privileged \\",
    `  -e AUTHSEC_URL=${url} \\`,
    "  -e AUTHSEC_HOST_ROOT=/host \\",
    "  -v /proc:/host/proc:ro -v /sys:/host/sys:ro \\",
    "  -v authsec-collector-state:/var/lib/authsec-local \\",
    "  authsec/iga-host-collector:latest \\",
    `  sh -c 'printf "%s" "${token}" > /tmp/t && authsec-local run \\`,
    "    --config /dev/null --enrollment-token-file /tmp/t'",
  ].join("\n");
}

export function EnrollDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<CollectorKind>("linux_collector");
  const [estateName, setEstateName] = useState("");
  const [issued, setIssued] = useState<IssuedEnrollment | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const [createToken, { isLoading: generating }] = useCreateEnrollmentTokenMutation();

  const reset = useCallback(() => {
    setKind("linux_collector");
    setEstateName("");
    setIssued(null);
    setRemaining(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Start countdown when token is issued.
  useEffect(() => {
    if (!issued) return;
    setRemaining(secondsLeft(issued.expires_at));
    timerRef.current = setInterval(() => {
      const left = secondsLeft(issued.expires_at);
      setRemaining(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [issued]);

  const generate = async () => {
    try {
      const result = await createToken({
        kind,
        ...(estateName.trim()
          ? { estate_scope: { kind: "host", display_name: estateName.trim() } }
          : {}),
      }).unwrap();
      setIssued(result);
      toast.success("Enrollment token generated.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not generate enrollment token."));
    }
  };

  const expired = issued != null && remaining <= 0;
  const cmd = issued ? dockerCommand(issued.token) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {issued ? "Enrollment token ready" : "Generate enrollment token"}
          </DialogTitle>
          <DialogDescription>
            {issued
              ? "Copy the command below and run it on the target host. The token is single-use."
              : "Creates a short-lived token a host collector exchanges for a permanent credential."}
          </DialogDescription>
        </DialogHeader>

        {!issued ? (
          /* ── Configure step ── */
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="enroll-kind">Collector kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CollectorKind)}>
                <SelectTrigger id="enroll-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as CollectorKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enroll-estate">
                Estate name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="enroll-estate"
                value={estateName}
                onChange={(e) => setEstateName(e.target.value)}
                placeholder="e.g. prod-api-01"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                A display name for this host in the estate. Leave blank to let the collector
                report its own hostname.
              </p>
            </div>
          </div>
        ) : (
          /* ── Token ready step ── */
          <div className="space-y-4 py-2">
            {/* Countdown */}
            <div className="flex items-center gap-2 text-sm">
              <Timer className="size-4 text-muted-foreground" />
              {expired ? (
                <span className="font-medium text-destructive">Token expired</span>
              ) : (
                <span>
                  Expires in{" "}
                  <span className="font-mono font-medium">{formatCountdown(remaining)}</span>
                </span>
              )}
            </div>

            {/* Token */}
            <div className="space-y-1.5">
              <Label>Enrollment token</Label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
                  {issued.token}
                </code>
                <CopyButton text={issued.token} label="Copy" />
              </div>
            </div>

            {/* Docker command */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Docker command</Label>
                <CopyButton text={cmd} label="Copy command" />
              </div>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                {cmd}
              </pre>
              <p className="text-xs text-muted-foreground">
                Paste this into a terminal on the target host. The collector enrolls, begins
                streaming observations, and appears in the table within 30 seconds.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {issued ? "Close" : "Cancel"}
          </Button>
          {!issued ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={generating}
              onClick={() => void generate()}
            >
              {generating ? "Generating..." : "Generate token"}
            </Button>
          ) : expired ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={reset}
            >
              Generate new token
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
