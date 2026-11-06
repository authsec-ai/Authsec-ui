/**
 * OTLP ingest tokens (administrators). List: GET /otlp-tokens (discovery:read); create POST and revoke DELETE
 * (discovery:admin, verified member session). The token is returned once, in the create response only, and is
 * held in this dialog's state alone. Collectors post to <endpoint> with `Authorization: Bearer <token>` (or
 * `X-AuthSec-Ingest-Token`); gzip or none, application/x-protobuf or application/json, 4 MB per request.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Copy } from "lucide-react";

import {
  OTLP_INGEST_PATH,
  useCreateOtlpTokenMutation,
  useListOtlpTokensQuery,
  useRevokeOtlpTokenMutation,
  type CreatedOtlpToken,
  type OtlpToken,
} from "@/app/api/igaAgentActivityApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { copyToClipboard } from "@/lib/clipboard";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr, shortTime } from "../model";
import { ActionError, Mono, ReadFailure } from "../parts";
import { useArAction } from "../useArAction";

function collectorSnippet(endpoint: string, token: string): string {
  return `exporters:
  otlphttp/authsec:
    traces_endpoint: ${endpoint}
    headers:
      Authorization: "Bearer ${token}"
service:
  pipelines:
    traces:
      exporters: [otlphttp/authsec]`;
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("90");
  const [created, setCreated] = useState<CreatedOtlpToken | null>(null);
  const [create, state] = useCreateOtlpTokenMutation();
  const act = useArAction();
  const close = () => {
    setLabel("");
    setDays("90");
    setCreated(null);
    // The token must not outlive the dialog in the API cache either.
    state.reset();
    act.clear();
    onClose();
  };
  const go = async () => {
    const res = await act.run(() => create({ label: label.trim() || undefined, expires_in_days: days === "" ? undefined : Number(days) }));
    if (res) {
      setCreated(res.data);
      state.reset();
    }
  };
  const daysOk = days === "" || (Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365);
  const relative = created?.endpoint.startsWith("/") ?? false;
  const snippet = created ? collectorSnippet(created.endpoint, created.token) : "";
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{created ? "OTLP token created" : "Create an OTLP token"}</DialogTitle>
          <DialogDescription>
            {created ? "Store the token and set up your collector now." : "A token lets one OpenTelemetry collector send GenAI traces to this workspace."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
              This is the only time the token is shown. Store it now: AuthSec cannot show it again. If it is lost, revoke it and create another.
            </p>
            <div className="space-y-1">
              <p className="text-xs text-(--color-text-muted)">Token</p>
              <div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
                <span className="flex-1 break-all font-mono text-[11.5px]">{created.token}</span>
                <button type="button" aria-label="Copy the token" onClick={() => void copyToClipboard(created.token, "Token")} className="flex size-6 flex-none items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground">
                  <Copy className="size-3" />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-(--color-text-muted)">OpenTelemetry Collector (exporter and pipeline)</p>
                <Button variant="outline" size="sm" onClick={() => void copyToClipboard(snippet, "Collector configuration")}>
                  Copy
                </Button>
              </div>
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11.5px]">{snippet}</pre>
            </div>
            {relative ? (
              <p className="text-xs text-(--color-text-muted)">
                The server did not report its public address: put your AuthSec API host before <Mono>{OTLP_INGEST_PATH}</Mono>.
              </p>
            ) : null}
            <p className="text-xs text-(--color-text-muted)">
              Alternatively send the token in the <Mono>X-AuthSec-Ingest-Token</Mono> header. Requests may be gzip or plain, <Mono>application/x-protobuf</Mono> or <Mono>application/json</Mono>, up to 4 MB.
              Spans carry no prompt or completion text into AuthSec: only GenAI, agent and MCP spans are kept, and attributes are bounded.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="otlp-label" className="text-[13px] font-medium">
                Label (optional)
              </label>
              <Input id="otlp-label" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} placeholder="prod collector" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="otlp-days" className="text-[13px] font-medium">
                Expires after (days)
              </label>
              <Input id="otlp-days" type="number" min={1} max={365} className="w-28" value={days} aria-invalid={!daysOk} onChange={(e) => setDays(e.target.value)} />
              <p className="text-xs text-(--color-text-muted)">1 to 365. Leave empty for a token that does not expire. A workspace holds at most 25 live tokens.</p>
            </div>
            <ActionError failure={act.failure} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            {created ? "I stored it" : "Cancel"}
          </Button>
          {!created ? (
            <Button className="text-white" onClick={() => void go()} disabled={act.pending || !daysOk}>
              {act.pending ? "Creating…" : "Create token"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATE_TONE = { active: "success", expired: "warning", revoked: "neutral" } as const;

function Row({ t, canAdmin }: { t: OtlpToken; canAdmin: boolean }) {
  const [revoke] = useRevokeOtlpTokenMutation();
  const act = useArAction();
  const [confirming, setConfirming] = useState(false);
  const go = async () => {
    const ok = await act.run(() => revoke({ id: t.id }));
    if (ok) {
      toast.success("Token revoked. Collectors using it are refused from now on.");
      setConfirming(false);
    }
  };
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <Mono>{t.token_prefix}…</Mono>
            {t.label ? <span className="font-medium">{t.label}</span> : null}
            <StatusBadge tone={STATE_TONE[t.state as keyof typeof STATE_TONE] ?? "neutral"}>{t.state}</StatusBadge>
          </p>
          <p className="text-xs text-(--color-text-muted)">
            Created {shortTime(t.created_at)} · {t.last_used_at ? `last used ${shortTime(t.last_used_at)}` : "never used"}
            {t.expires_at ? ` · expires ${shortTime(t.expires_at)}` : " · no expiry"}
            {t.revoked_at ? ` · revoked ${shortTime(t.revoked_at)}` : ""}
          </p>
        </div>
        {canAdmin && t.state === "active" ? (
          <div className="flex gap-2">
            {confirming ? (
              <>
                <Button variant="destructive" size="sm" className="text-white" onClick={() => void go()} disabled={act.pending}>
                  Confirm revoke
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={act.pending}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                Revoke
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <ActionError failure={act.failure} />
    </li>
  );
}

export function OtlpTokens({ canAdmin }: { canAdmin: boolean }) {
  const ws = getWorkspaceId() ?? "";
  const q = useListOtlpTokensQuery({ ws });
  const [adding, setAdding] = useState(false);
  const failure = classifyAr(q.error);
  return (
    <Panel
      title="OTLP tokens"
      count={q.data ? `${q.data.data.length}` : undefined}
      description="Let your OpenTelemetry collector send GenAI, agent and MCP traces. The token alone decides the workspace."
      actions={
        canAdmin ? (
          <Button className="text-white" size="sm" onClick={() => setAdding(true)}>
            Create token
          </Button>
        ) : null
      }
    >
      {q.isLoading ? <p role="status" className="text-[13px] text-(--color-text-muted)">Loading tokens…</p> : null}
      {failure && !q.data ? <ReadFailure failure={failure} subject="OTLP tokens" onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        q.data.data.length ? (
          <ul className="divide-y divide-(--color-border-subtle)">
            {q.data.data.map((t) => (
              <Row key={t.id} t={t} canAdmin={canAdmin} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-(--color-text-muted)">No token yet. Without one, AuthSec receives no OpenTelemetry traces.</p>
        )
      ) : null}
      {canAdmin ? <CreateDialog open={adding} onClose={() => setAdding(false)} /> : null}
    </Panel>
  );
}
