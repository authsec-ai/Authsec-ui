/**
 * Workspace gateway settings: GET/PUT /gateway-settings
 * (agent_gateway_controller.go:269-300, services/agent_gateway.go:121-136).
 * mode observe|enforce; cache_ttl_seconds 0..300; decision_retention_days
 * 7..3650. PUT keeps omitted fields and takes `version` (0 = nothing saved
 * yet); a stale one is 409 version_conflict. Read governance:read, write
 * governance:enforce plus a verified member session.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import { useGetGatewaySettingsQuery, usePutGatewaySettingsMutation, type GatewayMode, type GatewaySettings } from "@/app/api/igaAgentGatewayApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { usePolicyPermission } from "../../policy/shared";

import { classifyAr, shortTime } from "../model";
import { ActionError, ReadFailure } from "../parts";
import { MODE_COPY } from "./gatewayModel";
import { useGwAction } from "./useGwAction";

const intOk = (s: string, lo: number, hi: number) => /^\d+$/.test(s) && Number(s) >= lo && Number(s) <= hi;

function Form({ s }: { s: GatewaySettings }) {
  const [mode, setMode] = useState<GatewayMode>(s.mode);
  const [ttl, setTtl] = useState(String(s.cache_ttl_seconds));
  const [days, setDays] = useState(String(s.decision_retention_days));
  const [put] = usePutGatewaySettingsMutation();
  const { offered } = usePolicyPermission("governance:enforce");
  const act = useGwAction();
  const valid = intOk(ttl, 0, 300) && intOk(days, 7, 3650);
  const dirty = mode !== s.mode || ttl !== String(s.cache_ttl_seconds) || days !== String(s.decision_retention_days);

  const save = async () => {
    const ok = await act.run(() => put({ mode, cache_ttl_seconds: Number(ttl), decision_retention_days: Number(days), version: s.version }));
    if (ok) toast.success("Gateway settings saved.");
  };

  return (
    <div className="space-y-4">
      <Panel title="Mode" description="What happens to a call that no policy decides. Policies always apply; the mode covers the rest.">
        <div role="radiogroup" aria-label="Mode" className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(MODE_COPY) as GatewayMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={!offered}
              onClick={() => setMode(m)}
              className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-70 ${mode === m ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-strong) hover:bg-(--color-surface-subtle)"}`}
            >
              <span className="text-[13px] font-semibold">{MODE_COPY[m].title}</span>
              <p className="mt-1 text-xs text-(--color-text-secondary)">{MODE_COPY[m].body}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-(--color-text-muted)">A gateway also uses the mode when it cannot reach AuthSec and its fail mode is auto: in enforce mode it fails closed.</p>
      </Panel>

      <Panel title="Caching and retention">
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="gw-ttl" className="text-[13px] font-medium">
              Decision cache (seconds, 0 to 300)
            </label>
            <Input id="gw-ttl" className="w-28" inputMode="numeric" value={ttl} aria-invalid={!intOk(ttl, 0, 300)} disabled={!offered} onChange={(e) => setTtl(e.target.value)} />
            <p className="text-xs text-(--color-text-muted)">How long a gateway may reuse an answer before asking again. Shorter means a policy change reaches agents sooner; 0 turns caching off. Answers with a rate limit or a closing time window are cached for less, or not at all.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="gw-ret" className="text-[13px] font-medium">
              Keep decisions (days, 7 to 3650)
            </label>
            <Input id="gw-ret" className="w-28" inputMode="numeric" value={days} aria-invalid={!intOk(days, 7, 3650)} disabled={!offered} onChange={(e) => setDays(e.target.value)} />
            <p className="text-xs text-(--color-text-muted)">Older rows are deleted from the decision log.</p>
          </div>
        </div>
      </Panel>

      <ActionError failure={act.failure} />
      {offered ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button className="text-white" onClick={() => void save()} disabled={!dirty || !valid || act.pending}>
            {act.pending ? "Saving…" : "Save settings"}
          </Button>
          {!valid ? <span role="alert" className="text-xs text-(--color-danger-text)">Cache is 0 to 300 seconds and retention 7 to 3650 days.</span> : null}
          {s.version === 0 ? <span className="text-xs text-(--color-text-muted)">Showing defaults: nothing has been saved yet.</span> : s.updated_at ? <span className="text-xs text-(--color-text-muted)">Last changed {shortTime(s.updated_at)}</span> : null}
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted)">Your role can read these settings but not change them.</p>
      )}
    </div>
  );
}

export function SettingsTab({ ws }: { ws: string }) {
  const q = useGetGatewaySettingsQuery({ ws });
  const failure = classifyAr(q.error);
  return (
    <>
      {failure && !q.data ? <ReadFailure failure={failure} subject="gateway settings" onRetry={() => void q.refetch()} /> : null}
      {q.data ? <Form key={q.data.data.version} s={q.data.data} /> : !failure ? <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading settings" /> : null}
    </>
  );
}
