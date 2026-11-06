/**
 * Model provider usage (SPEC-agent-runtime-provider-usage.md): the OpenAI and
 * Anthropic organisations connected with an admin key. Route
 * /iga/agent-runtime/model-providers; a row opens /iga/agent-runtime/model-providers/:id.
 * Reads need discovery:read; Connect, Sync now, Rotate and Revoke need
 * governance:enforce and a verified workspace member session.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import { useListModelProvidersQuery, useSyncModelProviderMutation, type ModelProviderConnection } from "@/app/api/igaAgentModelProvidersApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr, shortTime } from "../model";
import { ActionError, Mono, ReadFailure } from "../parts";
import { usePolicyPermission } from "../../policy/shared";
import { useGwAction } from "../gateway/useGwAction";
import { providerText } from "./providerModel";
import { ConnectDialog, RevokeDialog, RotateDialog, StatusChip } from "./providerParts";

function Row({ c, onRotate, onRevoke }: { c: ModelProviderConnection; onRotate: () => void; onRevoke: () => void }) {
  const [sync] = useSyncModelProviderMutation();
  const act = useGwAction();
  const canWrite = usePolicyPermission("governance:enforce").offered;
  const revoked = c.status === "revoked";
  const runSync = async () => {
    const res = await act.run(() => sync({ id: c.id }));
    if (res) toast.success(res.data.next_sync_at ? `Sync queued for ${shortTime(res.data.next_sync_at)}.` : "Sync queued.");
  };
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/iga/agent-runtime/model-providers/${c.id}`} className="text-[13px] font-medium hover:text-(--color-primary-text) hover:underline">
              {c.display_name}
            </Link>
            <StatusChip status={c.status} />
          </div>
          <p className="text-xs text-(--color-text-muted)">
            {providerText(c.provider)} · organisation {c.org_name || c.org_id || "unknown"}
            {c.org_name && c.org_id ? <> (<Mono>{c.org_id}</Mono>)</> : null}
          </p>
          <p className="text-xs text-(--color-text-muted)">
            Last sync {c.last_sync_at ? shortTime(c.last_sync_at) : "never"} · key <Mono title="Last 4 characters and a hash prefix. The key itself is never shown.">{c.key_fingerprint}</Mono>
            {revoked && c.revoked_at ? ` · revoked ${shortTime(c.revoked_at)}` : ""}
          </p>
          {c.last_error ? <p className="text-xs text-(--color-danger-text)">Last error: {c.last_error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/iga/agent-runtime/model-providers/${c.id}`}>Keys and usage</Link>
          </Button>
          {!revoked && canWrite ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void runSync()} disabled={act.pending}>
                {act.pending ? "Queuing…" : "Sync now"}
              </Button>
              <Button variant="outline" size="sm" onClick={onRotate}>
                Rotate key
              </Button>
              <Button variant="outline" size="sm" onClick={onRevoke}>
                Revoke
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <ActionError failure={act.failure} />
    </li>
  );
}

export default function ModelProvidersPage() {
  const ws = getWorkspaceId() ?? "";
  const q = useListModelProvidersQuery({ ws }, { pollingInterval: 60_000, skipPollingIfUnfocused: true });
  const [connecting, setConnecting] = useState(false);
  const canConnect = usePolicyPermission("governance:enforce").offered;
  const [rotating, setRotating] = useState<ModelProviderConnection | null>(null);
  const [revoking, setRevoking] = useState<ModelProviderConnection | null>(null);
  const failure = classifyAr(q.error);
  const rows = q.data?.data ?? [];

  return (
    <ConsolePage
      title="Model providers"
      description="OpenAI and Anthropic organisations you connect with an admin key, to see which provider keys are in use and whether AuthSec can account for them."
      actions={
        canConnect ? (
          <Button className="text-white" size="sm" onClick={() => setConnecting(true)}>
            Connect organisation
          </Button>
        ) : null
      }
    >
      {failure && !q.data ? (
        <ReadFailure failure={failure} subject="model providers" onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Loading connected organisations…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-6 text-center text-sm text-(--color-text-muted)">
          No organisation connected. This is opt-in: nothing is read from OpenAI or Anthropic until an administrator connects an organisation with an organisation-wide admin key.
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle) rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
          {rows.map((c) => (
            <Row key={c.id} c={c} onRotate={() => setRotating(c)} onRevoke={() => setRevoking(c)} />
          ))}
        </ul>
      )}
      <ConnectDialog open={connecting} onClose={() => setConnecting(false)} />
      <RotateDialog conn={rotating} onClose={() => setRotating(null)} />
      <RevokeDialog conn={revoking} onClose={() => setRevoking(null)} />
    </ConsolePage>
  );
}
