/**
 * A Kubernetes cluster's Enforcement tab: what AuthSec can make happen in the
 * cluster, and how to turn it on (k8sEnforcement.ts).
 *
 * The console mints the cluster's actuation token (governance:admin; shown
 * once, rotating it cuts the old one off) and writes the two commands that
 * hand it to the agent. Nothing is pushed: the agent's Helm values decide, and
 * the panel shows what the agent REPORTED, so "on" here means the agent said so.
 */

import { Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Connection } from "@/app/api/connectionsApi";
import { useDisableActuationMutation, useEnableActuationMutation, useGetDiscoverySourceQuery } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyToClipboard } from "@/lib/clipboard";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { Timestamp } from "../shared/components/Timestamp";
import { ConnPill } from "./ConnPill";
import {
  DEFAULT_CHART_REF,
  helmDisableCommand,
  helmEnforcementCommand,
  inUseText,
  installProblem,
  k8sEnforcementState,
  secretCommand,
  type EnforcementInUse,
  type PowerState,
} from "./k8sEnforcement";
import { useCanAdminister } from "./permissions";

const MUTED = "text-(--color-text-muted)";

function Power({ state, on, off, waiting }: { state: PowerState; on: string; off: string; waiting: string }) {
  if (state === "on") return <ConnPill tone="success">{on}</ConnPill>;
  if (state === "not_reported") return <ConnPill tone="warning">{waiting}</ConnPill>;
  return <ConnPill tone="muted">{off}</ConnPill>;
}

function Command({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        <button
          type="button"
          onClick={() => void copyToClipboard(text, label)}
          className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline"
        >
          <Copy className="size-3" aria-hidden="true" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs leading-5">
        {text}
      </pre>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      <p className={`text-xs ${MUTED}`}>{hint}</p>
    </div>
  );
}

export function K8sEnforcementTab({ c }: { c: Connection }) {
  const source = useGetDiscoverySourceQuery(c.id);
  const canAdminister = useCanAdminister();
  const [mint, minting] = useEnableActuationMutation();
  const [confirm, setConfirm] = useState(false);
  const [disable, disabling] = useDisableActuationMutation();
  const [confirmOff, setConfirmOff] = useState(false);
  const [turnedOff, setTurnedOff] = useState(false);
  const [ingestSecret, setIngestSecret] = useState("authsec-iga-ingest");
  const [token, setToken] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [install, setInstall] = useState({ chartRef: DEFAULT_CHART_REF, quarantineNamespaces: "", bindingRoles: "", bindingNamespaces: "", clusterWide: false });

  if (source.isError && !source.data) {
    return (
      <LoadFailurePanel
        failure={loadFailureOf(source.error) ?? "failed"}
        subject="this cluster's enforcement"
        permission="discovery:read"
        onRetry={() => void source.refetch()}
      />
    );
  }
  if (!source.data) return <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />;

  const s = source.data;
  const st = k8sEnforcementState(s);
  const problem = installProblem(install);

  const doMint = async () => {
    setMintError(null);
    try {
      const r = await mint(c.id).unwrap();
      setToken(r.actuation_token);
      setConfirm(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setMintError(
        status === 403
          ? "Your role cannot turn on enforcement: it needs governance:admin."
          : status === 400
            ? "This cluster's row was created by hand, not by an agent, so there is no agent to act."
            : "The token could not be created. Try again.",
      );
      setConfirm(false);
    }
  };

  const doDisable = async () => {
    setMintError(null);
    try {
      await disable(c.id).unwrap();
      setTurnedOff(true);
      setToken(null);
    } catch (e) {
      const err = e as { status?: number; data?: { in_use?: EnforcementInUse } };
      setMintError(
        err.status === 409
          ? inUseText(err.data?.in_use)
          : err.status === 403
            ? "Your role cannot turn enforcement off: it needs governance:admin."
            : "Enforcement could not be turned off. Try again.",
      );
    }
    setConfirmOff(false);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="In-cluster enforcement"
        description="AuthSec never calls into the cluster: the agent polls for work with its actuation token and reports what it is allowed to do."
        actions={
          canAdminister && !token ? (
            <>
              {st.actuation ? (
                <Button size="sm" variant="outline" onClick={() => setConfirmOff(true)} disabled={disabling.isLoading}>
                  {disabling.isLoading ? "Turning off…" : "Turn off enforcement"}
                </Button>
              ) : null}
              <Button size="sm" variant={st.actuation ? "outline" : "default"} onClick={() => setConfirm(true)} disabled={minting.isLoading}>
                {minting.isLoading ? "Creating…" : st.actuation ? "Rotate token" : "Turn on enforcement"}
              </Button>
            </>
          ) : undefined
        }
      >
        <Facts>
          <Fact label="Actuation token">
            {st.actuation ? (
              <span>
                Created <Timestamp iso={st.actuationSince} />
              </span>
            ) : (
              <span className={MUTED}>Not created. The agent can only discover.</span>
            )}
          </Fact>
          <Fact label="Quarantine">
            <span className="flex flex-wrap items-center gap-2">
              <Power state={st.quarantine} on="Can act" off="Off" waiting="Waiting for the agent" />
              <span className={`text-xs ${MUTED}`}>Cuts a quarantined agent's network with a NetworkPolicy. Quarantine from its sighting.</span>
            </span>
          </Fact>
          <Fact label="Access policies">
            <span className="flex flex-wrap items-center gap-2">
              <Power state={st.accessPolicies} on="Can act" off="Off" waiting="Waiting for the agent" />
              <span className={`text-xs ${MUTED}`}>
                Takes a ServiceAccount out of a role's bindings for a set time (iga-agent 0.5.0).{" "}
                <Link to="/iga/policy/new?provider=k8s" className="text-(--color-primary-text) hover:underline">
                  Create policy
                </Link>
              </span>
            </span>
          </Fact>
          {st.reported ? (
            <Fact label="Agent reports">
              Mode {st.mode}
              {st.evict ? ", may evict pods" : ""}
              {s.enforced_plan_at ? (
                <span className={MUTED}>
                  {" "}
                  · plan applied <Timestamp iso={s.enforced_plan_at} />
                </span>
              ) : null}
            </Fact>
          ) : null}
          <Fact label="Agent version">{s.agent_version ? `v${s.agent_version}` : <span className={MUTED}>Not reported</span>}</Fact>
        </Facts>
        {mintError ? <p className="mt-3 text-xs text-(--color-danger-text)">{mintError}</p> : null}
        {!canAdminister ? <p className={`mt-3 text-xs ${MUTED}`}>An administrator turns enforcement on.</p> : null}
      </Panel>

      {token ? (
        <Panel
          title="Hand the token to the agent"
          description="The token is shown once. Store it in the cluster as a Secret, then upgrade the agent: until then AuthSec refuses this cluster's discovery reports. The agent's Helm values decide what it may do."
          actions={
            <Button size="sm" variant="outline" onClick={() => setToken(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-4">
            <Command label="1. Store the token" text={secretCommand(token)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="ns" label="Quarantine may act in" hint="Namespaces, space-separated. Only these; never the agent's own.">
                <Input id="ns" value={install.quarantineNamespaces} placeholder="e.g. agent-demo iga-demo" onChange={(e) => setInstall({ ...install, quarantineNamespaces: e.target.value })} />
              </Field>
              <Field id="chart" label="Chart" hint="Where your deployment publishes the iga-agent chart (0.5.0 or later).">
                <Input id="chart" value={install.chartRef} onChange={(e) => setInstall({ ...install, chartRef: e.target.value })} />
              </Field>
              <Field id="roles" label="Access policies may change bindings of" hint="Role or ClusterRole names. Empty leaves access policies off.">
                <Input id="roles" value={install.bindingRoles} placeholder="e.g. rag-reader" onChange={(e) => setInstall({ ...install, bindingRoles: e.target.value })} />
              </Field>
              <Field id="bns" label="…in RoleBindings of these namespaces" hint="The agent is granted bind on exactly the roles above, never escalate.">
                <Input id="bns" value={install.bindingNamespaces} placeholder="e.g. agent-demo" onChange={(e) => setInstall({ ...install, bindingNamespaces: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={install.clusterWide} onChange={(e) => setInstall({ ...install, clusterWide: e.target.checked })} />
              Also ClusterRoleBindings (a role granted in every namespace)
            </label>
            {problem ? <p className="text-xs text-(--color-warning-text)">{problem}</p> : null}
            <Command label="2. Upgrade the agent" text={helmEnforcementCommand(install)} />
            <p className={`text-xs ${MUTED}`}>
              Within a minute of the upgrade the agent reports its powers here. Lost the token? Rotate it: the old one stops working at once.
            </p>
          </div>
        </Panel>
      ) : null}

      {turnedOff && !st.actuation ? (
        <Panel
          title="Switch the agent back to discovery"
          description="Enforcement is off: the token no longer works, so AuthSec refuses this cluster's reports until the agent sends its discovery ingest token again."
          actions={
            <Button size="sm" variant="outline" onClick={() => setTurnedOff(false)}>
              Done
            </Button>
          }
        >
          <div className="space-y-3">
            <Field id="ingest" label="Ingest token Secret" hint="The Secret in authsec-system that holds the agent's discovery ingest token (key sourceToken).">
              <Input id="ingest" value={ingestSecret} onChange={(e) => setIngestSecret(e.target.value)} />
            </Field>
            <Command label="Upgrade the agent, then remove the token" text={helmDisableCommand(install.chartRef, ingestSecret)} />
          </div>
        </Panel>
      ) : null}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off enforcement?</DialogTitle>
            <DialogDescription>
              The cluster's token stops working at once: nothing can be quarantined or blocked on this cluster, and AuthSec refuses its
              discovery reports until the agent is switched back to its ingest token (the command is shown next). AuthSec refuses this
              while a quarantine or an access policy is still in force here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDisable()} disabled={disabling.isLoading}>
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{st.actuation ? "Rotate the actuation token?" : "Turn on enforcement?"}</DialogTitle>
            <DialogDescription>
              {st.actuation
                ? "The agent's current token stops working at once: until the new one is stored in the cluster and the agent upgraded, AuthSec refuses its discovery reports, and quarantines and access policies cannot reach it."
                : "AuthSec creates this cluster's token and from then on accepts its discovery reports only under it: discovery from the cluster pauses until you store the token and upgrade the agent (two commands, shown next). Have cluster access ready."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={() => void doMint()} disabled={minting.isLoading}>
              {st.actuation ? "Rotate" : "Create the token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
