/**
 * SIEM webhook endpoints (agent_runtime_alerts_controller.go:259-345). The
 * list shows each URL as the backend returns it (redacted). Adding one returns
 * the signing secret ONCE: it is shown with a copy button and a warning, and
 * is not in any later read.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import {
  useCreateSiemEndpointMutation,
  useDeleteSiemEndpointMutation,
  useListSiemEndpointsQuery,
  useTestSiemEndpointMutation,
  type CreatedSiemEndpoint,
  type SiemEndpoint,
} from "@/app/api/igaAgentRuntimeApi";
import { CopyField } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";

import { classifyAr, shortTime } from "./model";
import { ActionError, Mono, ReadFailure } from "./parts";
import { useArAction } from "./useArAction";

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [created, setCreated] = useState<CreatedSiemEndpoint | null>(null);
  const [create, createState] = useCreateSiemEndpointMutation();
  const act = useArAction();

  const close = () => {
    setUrl("");
    setSecret("");
    setCreated(null);
    // The secret must not outlive the dialog in the API cache either.
    createState.reset();
    act.clear();
    onClose();
  };
  const go = async () => {
    const res = await act.run(() => create({ url: url.trim(), secret: secret.trim() || undefined }));
    if (res) {
      setCreated(res.data);
      // Held in this dialog's state only: drop the cached mutation result that also carries the secret.
      createState.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? "Endpoint added" : "Add a SIEM endpoint"}</DialogTitle>
          <DialogDescription>
            {created ? "Store the signing secret now." : "AuthSec posts each new alert as JSON to this HTTPS URL, signed with an HMAC secret."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
              This is the only time the signing secret is shown. Store it now: AuthSec cannot show it again. To change it, delete the endpoint and add a new one.
            </p>
            <div className="grid grid-cols-2">
              <CopyField label="Signing secret" value={created.secret} />
            </div>
            <p className="text-xs text-(--color-text-muted)">
              Verify with <Mono>{created.signature}</Mono>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="siem-url" className="text-[13px] font-medium">
                URL
              </label>
              <Input id="siem-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://siem.example.com/hooks/authsec" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="siem-secret" className="text-[13px] font-medium">
                Signing secret (optional)
              </label>
              <Input id="siem-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Leave empty and AuthSec generates one" autoComplete="off" />
            </div>
            <ActionError failure={act.failure} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            {created ? "I stored it" : "Cancel"}
          </Button>
          {!created ? (
            <Button className="text-white" onClick={() => void go()} disabled={act.pending || !url.trim()}>
              {act.pending ? "Adding…" : "Add endpoint"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ ep }: { ep: SiemEndpoint }) {
  const [test] = useTestSiemEndpointMutation();
  const [del] = useDeleteSiemEndpointMutation();
  const act = useArAction();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runTest = async () => {
    setResult(null);
    const res = await act.run(() => test({ id: ep.id }));
    if (res) setResult(res.data.delivered ? `Delivered${res.data.http_status ? ` (HTTP ${res.data.http_status})` : ""}.` : `Not delivered${res.data.http_status ? ` (HTTP ${res.data.http_status})` : ""}${res.data.error ? `: ${res.data.error}` : "."}`);
  };
  const runDelete = async () => {
    const ok = await act.run(() => del({ id: ep.id }));
    if (ok !== undefined) {
      toast.success("Endpoint deleted.");
      setConfirming(false);
    }
  };

  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Mono title="The URL as the backend returns it (redacted)">{ep.url}</Mono>
          <p className="text-xs text-(--color-text-muted)">
            Added {shortTime(ep.created_at)} · {ep.enabled ? "enabled" : "disabled"} · {ep.secret_set ? "signing secret set" : "no signing secret"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void runTest()} disabled={act.pending}>
            Send test
          </Button>
          {confirming ? (
            <>
              <Button variant="destructive" size="sm" className="text-white" onClick={() => void runDelete()} disabled={act.pending}>
                Confirm delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      {result ? <p role="status" className="text-xs">{result}</p> : null}
      <ActionError failure={act.failure} />
    </li>
  );
}

export function SiemEndpoints({ ws }: { ws: string }) {
  const q = useListSiemEndpointsQuery({ ws });
  const [adding, setAdding] = useState(false);
  const failure = classifyAr(q.error);
  return (
    <Panel
      title="SIEM endpoints"
      count={q.data ? `${q.data.data.length}` : undefined}
      actions={
        <Button className="text-white" size="sm" onClick={() => setAdding(true)}>
          Add endpoint
        </Button>
      }
      description="Signed JSON webhooks, one per endpoint. Delivery is retried and recorded on each alert."
    >
      {failure && !q.data ? <ReadFailure failure={failure} subject="SIEM endpoints" onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        q.data.data.length ? (
          <ul className="divide-y divide-(--color-border-subtle)">
            {q.data.data.map((e) => (
              <Row key={e.id} ep={e} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-(--color-text-muted)">No SIEM endpoint. Alerts go to Slack only.</p>
        )
      ) : null}
      <AddDialog open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}
