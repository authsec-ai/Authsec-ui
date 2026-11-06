/**
 * AWS connection › Event stream: send CloudTrail events to AuthSec through
 * EventBridge so alerts and model-call evidence arrive within about a minute
 * instead of at the next scan. Scans keep polling as the backstop.
 *
 * The secret is returned once, by enable or rotate. It is shown here with a
 * copy button and never read back. The stream needs a CloudTrail trail; the
 * backend's notes (cost of data events, regions, the trail) are shown as sent.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import type { Connection } from "@/app/api/connectionsApi";
import {
  eventStreamTemplatePath,
  modelAccessTemplatePath,
  saveText,
  useDownloadAgentYamlMutation,
  useEnableEventStreamMutation,
  useGetEventStreamQuery,
  useGetEventStreamTemplateQuery,
  useGetModelAccessTemplateQuery,
  useRevokeEventStreamMutation,
  type EnabledEventStream,
  type EventStream,
  type ModelAccessForm,
} from "@/app/api/igaAgentRuntimeApi";
import { CopyField, DetailGrid, DetailRow } from "@/components/console/detail";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/features/iga/shared/components/Panel";
import { copyToClipboard } from "@/lib/clipboard";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr, failureText, shortTime, chipButtonClass } from "./model";
import { ActionError, NotAvailable, ReadFailure } from "./parts";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";
import { useArAction } from "./useArAction";

function Notes({ notes }: { notes: string[] | undefined }) {
  if (!notes?.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-xs text-(--color-text-muted)">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

/** Downloads a template's `?format=yaml` through the shared API client. `name` is the backend's own file name when it sent one. */
function useDownload() {
  const [fetchYaml] = useDownloadAgentYamlMutation();
  return async (path: string, name: string) => {
    try {
      saveText(await fetchYaml({ path }).unwrap(), name, "application/x-yaml");
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      const f = classifyAr(e);
      toast.error(f ? failureText(f) : "The download failed.");
    }
  };
}

function SecretOnce({ result, onHide }: { result: EnabledEventStream; onHide: () => void }) {
  const download = useDownload();
  const params = JSON.stringify(result.cloudformation.parameters, null, 2);
  return (
    <div className="space-y-3 rounded-md border border-(--color-warning) bg-(--color-warning-soft) p-4">
      <p role="alert" className="text-[13px] font-semibold text-(--color-warning-text)">
        {result.rotated ? "New secret. " : ""}Store it now: this is the only time AuthSec shows it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <CopyField label="Event secret (stack parameter EventSecret)" value={result.secret} />
      </div>
      {result.rotated ? <p className="text-xs text-(--color-warning-text)">The stream is stopped until the stack's EventSecret parameter is updated to this value.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copyToClipboard(params, "CloudFormation parameters")}>
          Copy CloudFormation parameters
        </Button>
        <Button variant="outline" size="sm" onClick={() => void download(eventStreamTemplatePath(result.stream.connector_id), "authsec-event-stream.yaml")}>
          Download template (YAML)
        </Button>
        <Button size="sm" className="text-white" onClick={onHide}>
          I stored it, hide the secret
        </Button>
      </div>
      <Notes notes={result.cloudformation.notes} />
    </div>
  );
}

function StreamPanel({ connectorId }: { connectorId: string }) {
  const ws = getWorkspaceId() ?? "";
  const q = useGetEventStreamQuery({ ws, connectorId }, { pollingInterval: 30_000, skipPollingIfUnfocused: true });
  const [enable, enableState] = useEnableEventStreamMutation();
  const download = useDownload();
  const [revoke] = useRevokeEventStreamMutation();
  const act = useArAction();
  const [once, setOnce] = useState<EnabledEventStream | null>(null);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const s: EventStream | undefined = q.data?.data;
  const tpl = useGetEventStreamTemplateQuery({ ws, connectorId }, { skip: s?.state !== "active" });
  const failure = classifyAr(q.error);

  const turnOn = async () => {
    const res = await act.run(() => enable({ connectorId }));
    if (res) {
      setOnce(res.data);
      // The secret lives only in this component's state now, not in the API cache.
      enableState.reset();
      setConfirm(null);
    }
  };
  const doRevoke = async () => {
    const res = await act.run(() => revoke({ connectorId }));
    if (res) {
      setOnce(null);
      enableState.reset();
      setConfirm(null);
      toast.success("Event stream revoked. Its secret is refused from now on.");
    }
  };

  if (failure && !s) {
    return (
      <Panel title="Event stream">
        <ReadFailure failure={failure} subject="the event stream" onRetry={() => void q.refetch()} />
      </Panel>
    );
  }
  if (!s) return <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the event stream" />;

  const stateChip =
    s.state === "active" ? <StatusBadge tone={s.silent ? "warning" : "success"}>{s.silent ? "Silent" : "Active"}</StatusBadge> : <StatusBadge tone="neutral">{s.state === "revoked" ? "Revoked" : "Not set up"}</StatusBadge>;

  return (
    <Panel
      title="Event stream"
      actions={stateChip}
      description="Sends CloudTrail events to AuthSec through EventBridge. It needs a CloudTrail trail in each region you watch. Scans keep polling as the backstop."
    >
      <div className="space-y-4">
        {s.state === "active" && s.silent ? (
          <DecisionBanner
            tone="warning"
            title={`Stream silent since ${shortTime(s.silent_since)}`}
            body={`Nothing has arrived for ${s.silent_after_minutes} minutes. Until it does, only scan polling covers this account, and events in the gap are not seen here.`}
          />
        ) : null}

        {once ? <SecretOnce result={once} onHide={() => setOnce(null)} /> : null}

        {s.state !== "not_configured" ? (
          <DetailGrid>
            <DetailRow label="Received" value={`${s.received_count} deliveries`} />
            <DetailRow label="Rejected" value={`${s.rejected_count} events (wrong account, invalid or oversize)`} />
            <DetailRow label="Last received" value={s.last_received_at ? shortTime(s.last_received_at) : "Nothing yet"} />
            <DetailRow label="Newest event time" value={s.last_event_time ? shortTime(s.last_event_time) : "Nothing yet"} />
            <DetailRow label="Secret" value={s.secret_prefix ? `${s.secret_prefix}…` : "none"} mono />
            <DetailRow label="Silent after" value={`${s.silent_after_minutes} minutes`} />
            {s.state === "revoked" ? <DetailRow label="Revoked" value={shortTime(s.revoked_at)} /> : null}
            {s.endpoint_url ? <DetailRow label="Endpoint" value={s.endpoint_url} mono full /> : null}
          </DetailGrid>
        ) : (
          <p className="text-[13px] text-(--color-text-muted)">Not set up. Without it, alerts and model-call evidence arrive at scan time only.</p>
        )}

        <ActionError failure={act.failure} />

        <div className="flex flex-wrap gap-2">
          {s.state === "active" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirm("rotate")}>
                Rotate secret
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirm("revoke")}>
                Revoke
              </Button>
              <Button variant="outline" size="sm" onClick={() => void download(eventStreamTemplatePath(connectorId), "authsec-event-stream.yaml")}>
                Download template (YAML)
              </Button>
            </>
          ) : (
            <Button className="text-white" size="sm" onClick={() => void turnOn()} disabled={act.pending}>
              {act.pending ? "Working…" : s.state === "revoked" ? "Enable again" : "Enable event stream"}
            </Button>
          )}
        </div>

        {s.state === "active" && tpl.data ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">CloudFormation stack</p>
            <Notes notes={tpl.data.data.notes} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyToClipboard(JSON.stringify(tpl.data?.data.parameters, null, 2), "CloudFormation parameters")}
            >
              Copy parameters (secret is a placeholder)
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => (!o && !act.pending ? setConfirm(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "rotate" ? "Rotate the secret?" : "Revoke the event stream?"}</DialogTitle>
            <DialogDescription>
              {confirm === "rotate"
                ? "A new secret is shown once. The stream stops until the stack's EventSecret parameter is updated."
                : "The secret is refused from now on, so events stop arriving. Counters stay. You can enable it again."}
            </DialogDescription>
          </DialogHeader>
          <ActionError failure={act.failure} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={act.pending}>
              Cancel
            </Button>
            <Button variant={confirm === "revoke" ? "destructive" : "default"} className="text-white" onClick={() => void (confirm === "rotate" ? turnOn() : doRevoke())} disabled={act.pending}>
              {act.pending ? "Working…" : confirm === "rotate" ? "Rotate" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function ModelAccessPanel() {
  const download = useDownload();
  const [mode, setMode] = useState<"audit" | "deny">("audit");
  const [form, setForm] = useState<ModelAccessForm>("scp");
  const q = useGetModelAccessTemplateQuery({ mode, form });
  const failure = classifyAr(q.error);
  const doc = q.data?.data;

  const get = async () => {
    if (!doc) return;
    if (doc.denies && doc.template) {
      await download(modelAccessTemplatePath(mode, form), doc.file_name ?? `authsec-model-access-${form}.yaml`);
    } else if (doc.audit !== undefined) {
      saveText(JSON.stringify(doc.audit, null, 2), `authsec-model-access-audit-${form}.json`);
    }
  };

  return (
    <Panel
      title="Model access template"
      description="Tag-gated: Bedrock model calls are refused unless the role carries the authsec:agent tag. Start in audit mode, which refuses nothing."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div role="radiogroup" aria-label="Mode" className="flex gap-1.5">
            {([["audit", "Audit (denies nothing)"], ["deny", "Deny"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={chipButtonClass(mode === k)}>
                {l}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Form" className="flex gap-1.5">
            {([["scp", "Service control policy"], ["policy", "Deny policy on roles"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={form === k} onClick={() => setForm(k)} className={chipButtonClass(form === k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {failure ? <ReadFailure failure={failure} subject="the template" onRetry={() => void q.refetch()} /> : null}
        {doc ? (
          <>
            <p className="text-[13px]">
              {doc.denies ? <strong>This changes what principals may do once deployed.</strong> : "Deploys nothing and refuses nothing."} Template version {doc.template_version}.
            </p>
            {doc.parameters?.length ? <p className="text-xs text-(--color-text-muted)">Parameters: {doc.parameters.join(", ")}</p> : null}
            <Notes notes={doc.notes} />
            <Button variant="outline" size="sm" onClick={() => void get()}>
              {doc.denies ? "Download template (YAML)" : "Download audit document (JSON)"}
            </Button>
          </>
        ) : !failure ? (
          <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the template" />
        ) : null}
      </div>
    </Panel>
  );
}

export function EventStreamTab({ c }: { c: Connection }) {
  const caps = useAgentRuntimeCaps(getWorkspaceId() ?? "", "agent_runtime");
  return (
    <div className="space-y-4">
      {caps.state === "available" ? <StreamPanel connectorId={c.id} /> : <NotAvailable caps={caps} what="Event stream" />}
      <ModelAccessPanel />
    </div>
  );
}
