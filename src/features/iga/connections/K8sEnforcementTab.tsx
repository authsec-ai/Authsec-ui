/**
 * A Kubernetes cluster's Enforcement tab: what AuthSec can make happen in the
 * cluster, and how to turn it on (k8sEnforcement.ts).
 *
 * Turn on, Rotate and Turn off are one click each (governance:admin): the
 * cluster's agent hands over its own credential on its next heartbeat, and
 * nothing is shown or copied. The one thing the console cannot grant is where
 * the agent may act -- write RBAC per namespace -- so the tab writes that
 * command for a cluster admin. Nothing is pushed: the panel shows what the
 * agent REPORTED, so "on" here means the agent said so.
 */

import { Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
  helmEnforcementCommand,
  helmRemoveRoleCommand,
  inUseText,
  installProblem,
  k8sEnforcementState,
  statusLine,
  type EnforcementInUse,
  type PowerState,
} from "./k8sEnforcement";
import { useCanAdminister } from "./permissions";

const MUTED = "text-(--color-text-muted)";

/** While the agent has not taken enforcement up, re-read the connector this often. */
const PENDING_POLL_MS = 10_000;

function Power({ state, on, off, waiting }: { state: PowerState; on: string; off: string; waiting: string }) {
  if (state === "on") return <ConnPill tone="success">{on}</ConnPill>;
  if (state === "not_reported") return <ConnPill tone="warning">{waiting}</ConnPill>;
  return <ConnPill tone="muted">{off}</ConnPill>;
}

function Command({ label, text, disabled }: { label: string; text: string; disabled?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        <button
          type="button"
          disabled={!!disabled}
          title={disabled ?? undefined}
          onClick={() => void copyToClipboard(text, label)}
          className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline disabled:cursor-not-allowed disabled:text-(--color-text-muted) disabled:no-underline"
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

type Confirm = "on" | "rotate" | "off" | null;

export function K8sEnforcementTab({ c }: { c: Connection }) {
  const [pending, setPending] = useState(false);
  const source = useGetDiscoverySourceQuery(c.id, { pollingInterval: pending ? PENDING_POLL_MS : 0 });
  const canAdminister = useCanAdminister();
  const [enable, enabling] = useEnableActuationMutation();
  const [disable, disabling] = useDisableActuationMutation();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [turnedOff, setTurnedOff] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [install, setInstall] = useState({ quarantineNamespaces: "", bindingRoles: "", bindingNamespaces: "", clusterWide: false });
  const [ingestSecret, setIngestSecret] = useState("authsec-iga-ingest");

  const actuationState = source.data?.actuation_state;
  useEffect(() => setPending(actuationState === "pending"), [actuationState]);

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
  // Moving off a token given by hand: discovery must go back to the ingest token.
  const command = st.agent === "manual" ? { ...install, ingestSecret } : install;
  const problem = installProblem(command);
  const busy = enabling.isLoading || disabling.isLoading;
  // The command is the way forward whenever the agent cannot take enforcement up.
  const setupOpen = st.agent !== "ready" || showSetup;

  const doEnable = async () => {
    setError(null);
    try {
      await enable(c.id).unwrap();
      setTurnedOff(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(
        status === 403
          ? "Your role cannot turn on enforcement: it needs governance:admin."
          : status === 400
            ? "This cluster's row was created by hand, not by an agent, so there is no agent to act."
            : "Enforcement could not be turned on. Try again.",
      );
    }
    setConfirm(null);
  };

  const doDisable = async () => {
    setError(null);
    try {
      await disable(c.id).unwrap();
      setTurnedOff(true);
    } catch (e) {
      const err = e as { status?: number; data?: { in_use?: EnforcementInUse } };
      setError(
        err.status === 409
          ? inUseText(err.data?.in_use)
          : err.status === 403
            ? "Your role cannot turn enforcement off: it needs governance:admin."
            : "Enforcement could not be turned off. Try again.",
      );
    }
    setConfirm(null);
  };

  const dialog = {
    on: {
      title: "Turn on enforcement?",
      body:
        st.agent === "ready"
          ? "The cluster's agent takes it up on its next heartbeat, within a minute, with a credential it generates itself: nothing to copy, and discovery keeps reporting throughout. Quarantines and access policies reach the cluster from then on."
          : "AuthSec turns it on now, and the cluster's agent takes it up once it has the actuation role (the command on this tab). Discovery keeps reporting throughout.",
      action: "Turn on",
    },
    rotate: {
      title: "Rotate the credential?",
      body: "The agent's current credential stops working at once. The agent hands over a new one on its next heartbeat, within a minute; quarantines and access policies wait until then. Discovery keeps reporting throughout.",
      action: "Rotate",
    },
    off: {
      title: "Turn off enforcement?",
      body: "The cluster's credential stops working at once and nothing can be quarantined or blocked on this cluster. The agent goes back to discovery on its next heartbeat; there is nothing to run. AuthSec refuses this while a quarantine or an access policy is still in force here.",
      action: "Turn off",
    },
  };

  return (
    <div className="space-y-4">
      <Panel
        title="In-cluster enforcement"
        description="AuthSec never calls into the cluster: the agent polls for work with its own credential and reports what it is allowed to do."
        actions={
          canAdminister ? (
            st.state === "off" ? (
              <Button size="sm" onClick={() => setConfirm("on")} disabled={busy}>
                Turn on enforcement
              </Button>
            ) : (
              <>
                {st.state === "on" ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirm("rotate")} disabled={busy}>
                    Rotate credential
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setConfirm("off")} disabled={busy}>
                  {disabling.isLoading ? "Turning off…" : "Turn off enforcement"}
                </Button>
              </>
            )
          ) : undefined
        }
      >
        <Facts>
          <Fact label="Enforcement">
            <span className="flex flex-wrap items-center gap-2">
              {st.state === "on" ? (
                <ConnPill tone="success">On</ConnPill>
              ) : st.state === "pending" ? (
                <ConnPill tone="warning">Waiting for the agent</ConnPill>
              ) : (
                <ConnPill tone="muted">Off</ConnPill>
              )}
              <span className={`text-xs ${st.state === "pending" && st.agent !== "ready" ? "text-(--color-warning-text)" : MUTED}`}>
                {statusLine(st, s.agent_version)}
              </span>
            </span>
          </Fact>
          {st.state !== "off" && st.since ? (
            <Fact label="Turned on">
              <Timestamp iso={st.since} />
            </Fact>
          ) : null}
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
                Takes a ServiceAccount out of a role's bindings for a set time.{" "}
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
          <Fact label="Agent">
            {s.agent_version ? `v${s.agent_version}` : <span className={MUTED}>Version not reported</span>}
            <span className={MUTED}>
              {" · "}
              {st.agent === "ready"
                ? "has the actuation role"
                : st.agent === "manual"
                  ? "uses a token given by hand"
                  : st.agent === "no_role"
                    ? "discovery only"
                    : "needs iga-agent 0.6.0 to take enforcement up from here"}
            </span>
          </Fact>
        </Facts>
        {error ? <p className="mt-3 text-xs text-(--color-danger-text)">{error}</p> : null}
        {!canAdminister ? <p className={`mt-3 text-xs ${MUTED}`}>An administrator turns enforcement on.</p> : null}
        {st.agent === "ready" && !showSetup ? (
          <button type="button" onClick={() => setShowSetup(true)} className="mt-3 text-xs text-(--color-primary-text) hover:underline">
            Change where the agent may act
          </button>
        ) : null}
      </Panel>

      {setupOpen ? (
        <Panel
          title={st.agent === "ready" ? "Change where the agent may act" : "Let the agent act"}
          description="The one step only a cluster admin can take: write access for the agent, in the namespaces named here and nowhere else. AuthSec cannot grant it from the console."
          actions={
            st.agent === "ready" ? (
              <Button size="sm" variant="outline" onClick={() => setShowSetup(false)}>
                Done
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="ns" label="Quarantine may act in" hint="Namespaces, space-separated. Only these; never the agent's own.">
                <Input id="ns" value={install.quarantineNamespaces} placeholder="e.g. agent-live-demo" onChange={(e) => setInstall({ ...install, quarantineNamespaces: e.target.value })} />
              </Field>
              <Field id="roles" label="Access policies may change bindings of" hint="Role or ClusterRole names. Empty keeps what the agent has now.">
                <Input id="roles" value={install.bindingRoles} placeholder="e.g. llm-key-reader" onChange={(e) => setInstall({ ...install, bindingRoles: e.target.value })} />
              </Field>
              <Field id="bns" label="…in RoleBindings of these namespaces" hint="The agent is granted bind on exactly the roles above, never escalate.">
                <Input id="bns" value={install.bindingNamespaces} placeholder="e.g. agent-live-demo" onChange={(e) => setInstall({ ...install, bindingNamespaces: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={install.clusterWide} onChange={(e) => setInstall({ ...install, clusterWide: e.target.checked })} />
              Also ClusterRoleBindings (a role granted in every namespace)
            </label>
            {st.agent === "manual" ? (
              <Field
                id="ingest"
                label="Discovery ingest token Secret"
                hint="In authsec-system, key sourceToken. The agent was given a token by hand and reports with it; it must report with its ingest token again, or it stops reporting when it hands over its own."
              >
                <Input id="ingest" value={ingestSecret} onChange={(e) => setIngestSecret(e.target.value)} />
              </Field>
            ) : null}
            {problem ? <p className="text-xs text-(--color-warning-text)">{problem}</p> : null}
            <Command label="Upgrade the agent" text={helmEnforcementCommand(command)} disabled={problem} />
            <p className={`text-xs ${MUTED}`}>
              Within a minute of the upgrade the agent reports its powers here.
              {st.state === "off" ? " Then turn enforcement on above." : " It takes enforcement up on its own; there is no token to copy."}
            </p>
          </div>
        </Panel>
      ) : null}

      {turnedOff && st.state === "off" ? (
        <Panel
          title="Enforcement is off"
          description="The agent reports under its discovery ingest token again on its next heartbeat. Its write access in the cluster stays until a cluster admin removes the role; to do that too:"
          actions={
            <Button size="sm" variant="outline" onClick={() => setTurnedOff(false)}>
              Done
            </Button>
          }
        >
          <Command label="Optional: remove the actuation role" text={helmRemoveRoleCommand()} />
        </Panel>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(o) => (o ? undefined : setConfirm(null))}>
        <DialogContent>
          {confirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialog[confirm].title}</DialogTitle>
                <DialogDescription>{dialog[confirm].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  variant={confirm === "off" ? "destructive" : "default"}
                  onClick={() => void (confirm === "off" ? doDisable() : doEnable())}
                  disabled={busy}
                >
                  {dialog[confirm].action}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
