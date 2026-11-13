/**
 * Alert settings: each detection on or off, the thresholds the backend takes
 * (D5 N in M minutes, D6 k), the dedupe window and retention, Slack, and SIEM
 * endpoints. PUT /alert-settings keeps every field you leave out.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";
import {
  useGetAgentAlertSettingsQuery,
  usePutAgentAlertSettingsMutation,
  type AlertSettings,
  type AlertSettingsUpdate,
  type DetectionId,
} from "@/app/api/igaAgentRuntimeApi";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/features/iga/shared/components/Panel";
import { setupTarget } from "@/features/iga/connections/connectionModel";
import { getWorkspaceId } from "@/utils/workspace";

import { DETECTION_IDS, DETECTION_NAME, classifyAr } from "./model";
import { ActionError, NotAvailable, ReadFailure } from "./parts";
import { SiemEndpoints } from "./SiemEndpoints";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";
import { useArAction } from "./useArAction";

/** An empty or non-positive number is not a setting: it is never sent, and Save waits until it is fixed. */
const validNumber = (n: number | undefined): boolean => n !== undefined && Number.isFinite(n) && n > 0;

function NumberField({ id, label, value, step, onChange }: { id: string; label: string; value: number | undefined; step?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-(--color-text-muted)">
        {label}
      </label>
      <Input id={id} type="number" min={1} step={step ?? 1} className="h-8 w-20" value={value !== undefined && Number.isFinite(value) ? value : ""} aria-invalid={!validNumber(value)} onChange={(e) => onChange(e.target.value.trim() === "" ? Number.NaN : Number(e.target.value))} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: AlertSettings }) {
  const [draft, setDraft] = useState<AlertSettings>(settings);
  const [put] = usePutAgentAlertSettingsMutation();
  const act = useArAction();
  const connections = useListDiscoveryConnectionsQuery().data;
  useEffect(() => setDraft(settings), [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const setDet = (id: DetectionId, patch: Partial<AlertSettings["detections"][string]>) =>
    setDraft((d) => ({ ...d, detections: { ...d.detections, [id]: { ...d.detections[id], ...patch } } }));

  const d5 = draft.detections.D5;
  const d6 = draft.detections.D6;
  const invalid =
    !validNumber(draft.dedupe_window_minutes) ||
    !validNumber(draft.retention_days) ||
    (!!d5 && (!validNumber(d5.n) || !validNumber(d5.minutes))) ||
    (!!d6 && !validNumber(d6.k));

  const save = async () => {
    if (invalid) return;
    const body: AlertSettingsUpdate = {
      slack_enabled: draft.slack_enabled,
      dedupe_window_minutes: draft.dedupe_window_minutes,
      retention_days: draft.retention_days,
      detections: Object.fromEntries(
        DETECTION_IDS.map((id) => {
          const d = draft.detections[id];
          return [id, { enabled: d?.enabled, ...(id === "D5" ? { n: d?.n, minutes: d?.minutes } : {}), ...(id === "D6" ? { k: d?.k } : {}) }];
        }),
      ),
    };
    const ok = await act.run(() => put(body));
    if (ok) toast.success("Alert settings saved.");
  };

  return (
    <div className="space-y-4">
      <Panel title="Detections" description="A detection that is off raises nothing, but its baseline keeps learning.">
        <ul className="divide-y divide-(--color-border-subtle)">
          {DETECTION_IDS.map((id) => {
            const d = draft.detections[id] ?? { enabled: true };
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Switch checked={d.enabled} onCheckedChange={(v) => setDet(id, { enabled: v })} aria-label={`${id} ${DETECTION_NAME[id]}`} />
                  <span className="text-[13px] font-medium">
                    {id} {DETECTION_NAME[id]}
                  </span>
                </div>
                {id === "D5" ? (
                  <div className="flex gap-3">
                    <NumberField id="d5-n" label="Denials" value={d.n} onChange={(n) => setDet(id, { n })} />
                    <NumberField id="d5-m" label="in minutes" value={d.minutes} onChange={(minutes) => setDet(id, { minutes })} />
                  </div>
                ) : null}
                {id === "D6" ? <NumberField id="d6-k" label="Times the 7-day baseline" value={d.k} step={0.5} onChange={(k) => setDet(id, { k })} /> : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Delivery and retention">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch checked={draft.slack_enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, slack_enabled: v }))} aria-label="Send alerts to Slack" />
              <span className="text-[13px] font-medium">Send alerts to Slack</span>
            </div>
            <p className="text-xs text-(--color-text-muted)">
              Uses the governance channel.{" "}
              <Link to={setupTarget(connections, "notifications")} className="font-semibold text-(--color-primary-text) hover:underline">
                Where it is configured
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <NumberField id="dedupe" label="Group repeats within minutes" value={draft.dedupe_window_minutes} onChange={(n) => setDraft((d) => ({ ...d, dedupe_window_minutes: n }))} />
            <NumberField id="retention" label="Keep alerts days" value={draft.retention_days} onChange={(n) => setDraft((d) => ({ ...d, retention_days: n }))} />
          </div>
        </div>
      </Panel>

      <ActionError failure={act.failure} />
      <div className="flex items-center gap-3">
        <Button className="text-white" onClick={() => void save()} disabled={!dirty || invalid || act.pending}>
          {act.pending ? "Saving…" : "Save settings"}
        </Button>
        {invalid ? <span role="alert" className="text-xs text-(--color-danger-text)">Enter a number above zero in each threshold field.</span> : null}
        {!settings.saved ? <span className="text-xs text-(--color-text-muted)">Showing defaults: nothing has been saved yet.</span> : null}
      </div>
    </div>
  );
}

export default function AlertSettingsPage() {
  const ws = getWorkspaceId() ?? "";
  const caps = useAgentRuntimeCaps(ws, "agent_alerts");
  const q = useGetAgentAlertSettingsQuery({ ws }, { skip: caps.state !== "available" });
  const failure = classifyAr(q.error);
  useBreadcrumbTail("/iga/agent-runtime/alert-settings", "Alert settings", { label: "Agent alerts", href: "/iga/agent-runtime/alerts" });

  return (
    <ConsolePage title="Alert settings" description="Which detections run, their thresholds, and where alerts go.">
      {caps.state !== "available" ? (
        <NotAvailable caps={caps} what="Agent alerts" />
      ) : (
        <>
          {failure && !q.data ? <ReadFailure failure={failure} subject="alert settings" onRetry={() => void q.refetch()} /> : null}
          {q.data ? <SettingsForm settings={q.data.data} /> : !failure ? <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading settings" /> : null}
          <SiemEndpoints ws={ws} />
        </>
      )}
    </ConsolePage>
  );
}
