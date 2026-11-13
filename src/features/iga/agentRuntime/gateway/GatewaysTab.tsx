/**
 * Gateways: register (the credential is shown once), rename, rotate (a new
 * credential, shown once; the old one stops working), revoke. Backed by
 * igaAgentGatewayApi (agent_gateway_controller.go:144-268). Reads need
 * governance:read, every change governance:enforce plus a verified member session.
 */

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useCreateAgentGatewayMutation,
  useListAgentGatewaysQuery,
  useRenameAgentGatewayMutation,
  useRevokeAgentGatewayMutation,
  useRotateAgentGatewayMutation,
  type AgentGateway,
  type GatewayCredentialResult,
} from "@/app/api/igaAgentGatewayApi";
import { CopyField } from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/clipboard";
import { Panel } from "@/features/iga/shared/components/Panel";
import { usePolicyPermission } from "../../policy/shared";

import { classifyAr, shortTime } from "../model";
import { ActionError, Mono, ReadFailure } from "../parts";
import { CONFIG_SNIPPET, HELM_ENV_SNIPPET, dockerSnippet, secretSnippet } from "./gatewayModel";
import { useGwAction } from "./useGwAction";

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-(--color-text-muted)">{label}</span>
        <button type="button" aria-label={`Copy ${label}`} onClick={() => void copyToClipboard(text)} className="flex size-6 items-center justify-center rounded-md border text-(--color-text-muted) hover:text-(--color-text)">
          <Copy className="size-3" />
        </button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md bg-(--color-surface-subtle) p-2.5 font-mono text-[11.5px] leading-relaxed">{text}</pre>
    </div>
  );
}

/** The one place a credential is on screen: held in dialog state only. */
function CredentialView({ result, rotated }: { result: GatewayCredentialResult["data"]; rotated: boolean }) {
  const cred = result.credential;
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
      <p role="alert" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
        This is the only time the credential is shown. Store it now: AuthSec keeps only a hash and cannot show it again.
        {rotated ? " The previous credential no longer works, so update the running gateway." : ""}
      </p>
      <div className="grid grid-cols-2">
        <CopyField label={`Credential for ${result.gateway.name}`} value={cred} />
      </div>
      <Snippet label="1. Kubernetes Secret (deploy/agent-gateway/values.yaml reads it)" text={secretSnippet(cred)} />
      <Snippet label="2. Helm values: how the pod gets it" text={HELM_ENV_SNIPPET} />
      <Snippet label="3. config.yaml (never holds the credential)" text={CONFIG_SNIPPET} />
      <Snippet label="Or run it with Docker" text={dockerSnippet(cred)} />
      <p className="text-xs text-(--color-text-muted)">
        The gateway calls AuthSec at <Mono>{result.pdp.evaluation_path}</Mono> with <Mono>{result.pdp.header}</Mono>. Agents reach the gateway, never AuthSec. Keep its Service internal.
      </p>
    </div>
  );
}

function RegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<GatewayCredentialResult["data"] | null>(null);
  const [create, state] = useCreateAgentGatewayMutation();
  const act = useGwAction();
  const close = () => {
    setName("");
    setCreated(null);
    state.reset(); // the credential must not outlive the dialog in the API cache
    act.clear();
    onClose();
  };
  const go = async () => {
    const res = await act.run(() => create({ name: name.trim() }));
    if (res) {
      setCreated(res.data);
      state.reset();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{created ? "Gateway registered" : "Register a gateway"}</DialogTitle>
          <DialogDescription>
            {created ? "Give the credential to the gateway you run next to your agents." : "A gateway is the enforcement point you run in your environment. Registering it creates its credential."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <CredentialView result={created} rotated={false} />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="gw-name" className="text-[13px] font-medium">
                Name
              </label>
              <Input id="gw-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="prod-cluster-1" autoComplete="off" />
              <p className="text-xs text-(--color-text-muted)">Up to 200 characters. An active gateway's name must be unique.</p>
            </div>
            <ActionError failure={act.failure} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            {created ? "I stored it" : "Cancel"}
          </Button>
          {!created ? (
            <Button className="text-white" onClick={() => void go()} disabled={act.pending || !name.trim()}>
              {act.pending ? "Registering…" : "Register"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ gw, onClose }: { gw: AgentGateway | null; onClose: () => void }) {
  const [name, setName] = useState(gw?.name ?? "");
  const [rename] = useRenameAgentGatewayMutation();
  const act = useGwAction();
  const go = async () => {
    if (!gw) return;
    const ok = await act.run(() => rename({ id: gw.id, name: name.trim(), version: gw.version }));
    if (ok) {
      toast.success("Gateway renamed.");
      onClose();
    }
  };
  return (
    <Dialog open={!!gw} onOpenChange={(o) => (!o && !act.pending ? (act.clear(), onClose()) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename gateway</DialogTitle>
          <DialogDescription>The credential is unchanged. Policies that select this gateway keep working.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="gw-rename" className="text-[13px] font-medium">
            Name
          </label>
          <Input id="gw-rename" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <ActionError failure={act.failure} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || !name.trim() || name.trim() === gw?.name}>
            {act.pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotateDialog({ gw, onClose }: { gw: AgentGateway | null; onClose: () => void }) {
  const [result, setResult] = useState<GatewayCredentialResult["data"] | null>(null);
  const [rotate, state] = useRotateAgentGatewayMutation();
  const act = useGwAction();
  const close = () => {
    setResult(null);
    state.reset();
    act.clear();
    onClose();
  };
  const go = async () => {
    if (!gw) return;
    const res = await act.run(() => rotate({ id: gw.id }));
    if (res) {
      setResult(res.data);
      state.reset();
    }
  };
  return (
    <Dialog open={!!gw} onOpenChange={(o) => (!o && !act.pending ? close() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{result ? "New credential" : `Rotate credential of ${gw?.name ?? ""}`}</DialogTitle>
          <DialogDescription>
            {result ? "Replace the credential on the running gateway." : "AuthSec issues a new credential. The current one stops working within seconds, so the gateway cannot ask AuthSec until you update it."}
          </DialogDescription>
        </DialogHeader>
        {result ? <CredentialView result={result} rotated /> : <ActionError failure={act.failure} />}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            {result ? "I stored it" : "Cancel"}
          </Button>
          {!result ? (
            <Button className="text-white" onClick={() => void go()} disabled={act.pending}>
              {act.pending ? "Rotating…" : "Rotate credential"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ gw, onClose }: { gw: AgentGateway | null; onClose: () => void }) {
  const [revoke] = useRevokeAgentGatewayMutation();
  const act = useGwAction();
  const go = async () => {
    if (!gw) return;
    const ok = await act.run(() => revoke({ id: gw.id }));
    if (ok) {
      toast.success("Gateway revoked.");
      onClose();
    }
  };
  return (
    <Dialog open={!!gw} onOpenChange={(o) => (!o && !act.pending ? (act.clear(), onClose()) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {gw?.name}?</DialogTitle>
          <DialogDescription>
            Its credential stops working and it cannot be rotated back. What the gateway does next follows its own fail mode. Past decisions stay in the log. To run it again, register a new gateway.
          </DialogDescription>
        </DialogHeader>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant="destructive" className="text-white" onClick={() => void go()} disabled={act.pending}>
            {act.pending ? "Revoking…" : "Revoke gateway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GatewaysTab({ ws }: { ws: string }) {
  const q = useListAgentGatewaysQuery({ ws });
  const { offered } = usePolicyPermission("governance:enforce");
  const [registering, setRegistering] = useState(false);
  const [renaming, setRenaming] = useState<AgentGateway | null>(null);
  const [rotating, setRotating] = useState<AgentGateway | null>(null);
  const [revoking, setRevoking] = useState<AgentGateway | null>(null);
  const failure = classifyAr(q.error);
  const rows = q.data?.data ?? [];

  return (
    <Panel
      title="Gateways"
      count={q.data ? `${rows.length}` : undefined}
      description="A gateway runs next to your agents, asks AuthSec whether each tool or model call is allowed, and enforces the answer."
      actions={
        offered ? (
          <Button className="text-white" size="sm" onClick={() => setRegistering(true)}>
            Register gateway
          </Button>
        ) : undefined
      }
    >
      {failure && !q.data ? <ReadFailure failure={failure} subject="gateways" onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading gateways" /> : null}
      {q.data && rows.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">No gateway yet. Register one to get a credential and the setup for your cluster.</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {rows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{g.name}</span>
                  <StatusBadge tone={g.state === "active" ? "success" : "neutral"}>{g.state === "active" ? "Active" : "Revoked"}</StatusBadge>
                </div>
                <p className="text-xs text-(--color-text-muted)">
                  <Mono title="First characters of the credential">{g.credential_prefix}…</Mono> · created {shortTime(g.created_at)}
                  {g.rotated_at ? ` · rotated ${shortTime(g.rotated_at)}` : ""}
                  {g.revoked_at ? ` · revoked ${shortTime(g.revoked_at)}` : ""}
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  {g.last_seen_at ? `Last seen ${shortTime(g.last_seen_at)}` : "Never seen: no request has reached AuthSec with its credential"}
                  {g.software_version ? ` · version ${g.software_version}` : ""}
                </p>
              </div>
              {offered && g.state === "active" ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRenaming(g)}>
                    Rename
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRotating(g)}>
                    Rotate credential
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRevoking(g)}>
                    Revoke
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <RegisterDialog open={registering} onClose={() => setRegistering(false)} />
      {renaming ? <RenameDialog key={renaming.id + renaming.version} gw={renaming} onClose={() => setRenaming(null)} /> : null}
      {rotating ? <RotateDialog key={rotating.id} gw={rotating} onClose={() => setRotating(null)} /> : null}
      {revoking ? <RevokeDialog key={revoking.id} gw={revoking} onClose={() => setRevoking(null)} /> : null}
    </Panel>
  );
}
