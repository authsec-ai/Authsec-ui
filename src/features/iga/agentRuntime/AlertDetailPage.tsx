/** One alert: what happened, the event references behind it, delivery status, and Acknowledge / Resolve. */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import { useGetAgentAlertQuery, useTransitionAgentAlertMutation, type AlertEventRef } from "@/app/api/igaAgentRuntimeApi";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DetailGrid, DetailRow } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { AlertStateChip, SeverityChip } from "./alertParts";
import { classifyAr, detectionText, shortTime, subjectLabelText } from "./model";
import { ActionError, Mono, NotAvailable, ReadFailure } from "./parts";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";
import { useArAction } from "./useArAction";

function TransitionDialog({ id, action, onClose }: { id: string; action: "acknowledge" | "resolve" | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [transition] = useTransitionAgentAlertMutation();
  const act = useArAction();
  useEffect(() => {
    if (action) {
      setReason("");
      act.clear();
    }
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);
  if (!action) return null;
  const go = async () => {
    const ok = await act.run(() => transition({ id, action, reason: reason.trim() }));
    if (ok) {
      toast.success(action === "resolve" ? "Alert resolved." : "Alert acknowledged.");
      onClose();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action === "resolve" ? "Resolve this alert?" : "Acknowledge this alert?"}</DialogTitle>
          <DialogDescription>
            {action === "resolve" ? "A resolved alert is closed: the next matching event opens a new one." : "An acknowledged alert is still extended by new matching events."} The reason is kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="alert-reason" className="text-[13px] font-medium">
            Reason
          </label>
          <Textarea id="alert-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Working…" : action === "resolve" ? "Resolve" : "Acknowledge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AlertDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const ws = getWorkspaceId() ?? "";
  const caps = useAgentRuntimeCaps(ws, "agent_alerts");
  const q = useGetAgentAlertQuery({ ws, id }, { skip: caps.state !== "available" || !id });
  const [action, setAction] = useState<"acknowledge" | "resolve" | null>(null);
  const a = q.data?.data;
  useBreadcrumbTail(id ? `/iga/agent-runtime/alerts/${id}` : null, a ? `${a.detection} ${detectionText(a.detection)}` : "Alert", { label: "Agent alerts", href: "/iga/agent-runtime/alerts" });
  const failure = classifyAr(q.error);

  return (
    <ConsolePage
      variant="object"
      title={a ? `${a.detection} ${a.detection_name || detectionText(a.detection)}` : "Alert"}
      description={a ? a.title : undefined}
      actions={
        a && a.state !== "resolved" ? (
          <>
            {a.state === "open" ? (
              <Button variant="outline" size="sm" onClick={() => setAction("acknowledge")}>
                Acknowledge
              </Button>
            ) : null}
            <Button className="text-white" size="sm" onClick={() => setAction("resolve")}>
              Resolve
            </Button>
          </>
        ) : undefined
      }
    >
      {caps.state !== "available" ? <NotAvailable caps={caps} what="Agent alerts" /> : null}
      {failure ? <ReadFailure failure={failure} subject="this alert" onRetry={() => void q.refetch()} /> : null}
      {caps.state === "available" && !a && !failure ? <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the alert" /> : null}
      {failure?.kind === "not_found" || failure?.kind === "unavailable" ? (
        <Button variant="outline" asChild>
          <Link to="/iga/agent-runtime/alerts">All alerts</Link>
        </Button>
      ) : null}
      {a ? (
        <>
          <Panel title="Summary">
            <DetailGrid>
              <DetailRow label="Severity" value={<SeverityChip severity={a.severity} />} />
              <DetailRow label="State" value={<AlertStateChip state={a.state} />} />
              <DetailRow label="Identity" value={a.subject_name || a.identity_id} />
              <DetailRow label="Seen as" value={subjectLabelText(a.subject_label)} />
              <DetailRow label="Workloads" value={a.workload_ids?.length ? `${a.workload_ids.length} (${a.workload_ids.join(", ")})` : "None collected"} mono />
              <DetailRow label="Events" value={a.event_count} />
              <DetailRow label="First seen" value={shortTime(a.first_seen)} />
              <DetailRow label="Last seen" value={shortTime(a.last_seen)} />
              {a.state !== "open" ? <DetailRow label={`${a.state === "resolved" ? "Resolved" : "Acknowledged"} at`} value={shortTime(a.state_changed_at)} /> : null}
              {a.reason ? <DetailRow label="Reason" value={a.reason} full /> : null}
            </DetailGrid>
          </Panel>

          <Panel title="Evidence" count={`${a.evidence?.length ?? 0} event references`} description="References only: no request or response body and no secret value is kept.">
            {a.evidence?.length ? (
              <ul className="divide-y divide-(--color-border-subtle)">
                {a.evidence.map((e: AlertEventRef) => (
                  <li key={e.event_id} className="py-2 text-[13px]">
                    <div className="flex flex-wrap gap-x-3">
                      <span className="font-medium">{e.name}</span>
                      <span className="text-(--color-text-muted)">{e.source}</span>
                      <span className="tabular-nums text-(--color-text-muted)">{shortTime(e.time)}</span>
                      {e.region ? <span className="text-(--color-text-muted)">{e.region}</span> : null}
                      {e.ip ? <Mono>{e.ip}</Mono> : null}
                      {e.error ? <span className="text-(--color-danger-text)">{e.error}</span> : null}
                    </div>
                    {e.detail ? <p className="text-xs text-(--color-text-muted)">{e.detail}</p> : null}
                    <p className="text-[11px] text-(--color-text-muted)">
                      CloudTrail event <Mono>{e.event_id}</Mono>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-(--color-text-muted)">No event references were kept.</p>
            )}
          </Panel>

          <Panel title="Delivery" description="Slack uses the governance channel; each SIEM endpoint is delivered to separately.">
            {a.deliveries?.length ? (
              <ul className="divide-y divide-(--color-border-subtle)">
                {a.deliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 py-2 text-[13px]">
                    <span className="font-medium capitalize">{d.channel}</span>
                    <span>{d.status}</span>
                    <span className="text-(--color-text-muted)">attempt {d.attempt}</span>
                    <span className="text-(--color-text-muted)">{d.sent_at ? `sent ${shortTime(d.sent_at)}` : `next try ${shortTime(d.next_attempt_at)}`}</span>
                    {d.last_error ? <span className="text-(--color-danger-text)">{d.last_error}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-(--color-text-muted)">No delivery was queued: Slack and SIEM delivery were off, or no endpoint existed when it opened.</p>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/iga/agent-runtime/alerts">All alerts</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/iga/discovery?provider=aws&type=ai_workloads`}>Open AI workloads</Link>
            </Button>
          </div>
        </>
      ) : null}
      <TransitionDialog id={id} action={action} onClose={() => setAction(null)} />
    </ConsolePage>
  );
}
