/**
 * Policy › Setup › Enforcement (SPEC-iga-phase3-policy.md §3.6, §9.3 S9): one
 * panel per connected AWS account with its binding state, the self-test
 * checklist, and the three actions (Enable enforcement, Re-run self-test,
 * Revoke).
 *
 * No route lists accounts with their binding, so the accounts come from the
 * connections list (`provider: "aws"`; `id` is the cloud connector id every
 * route here takes) and each account reads its own binding. Verifying is not an
 * observable state of its own (the verify call is synchronous), so a re-run
 * shows a busy state until the call answers.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useListDiscoveryConnectionsQuery, type Connection } from "@/app/api/connectionsApi";
import {
  useGetEnforcementBindingQuery,
  useGetEnforcementSessionQuery,
  useVerifyEnforcementMutation,
  type EnforcementBindingView,
} from "@/app/api/igaPolicySetupApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { CopyValue, Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { toast } from "react-hot-toast";

import {
  PolicyActionError,
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  relTime,
  usePolicyAction,
  usePolicyPermission,
} from "../shared";
import { EnableEnforcementDialog } from "./EnableEnforcementDialog";
import { awsAccounts, capabilityRows, hasBoundRole, setupStateView } from "./enforcementModel";
import { RevokeEnforcementDialog } from "./RevokeEnforcementDialog";
import { useMarkRefused } from "./useRefusal";

const POLL_MS = 5_000;

const INTRO =
  "AuthSec can read this account. A second, separate role lets AuthSec apply your policies: it can only create, attach and remove AuthSec-owned IAM policies. It cannot read data, read your policies, or change your own policies.";

function WhatItCanDo() {
  return (
    <details className="rounded-md border border-(--color-border-subtle) px-3 py-2">
      <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">What it can do</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-(--color-text-muted)">
        <li>
          Create, version and delete IAM policies under the <span className="font-mono">/authsec/</span> path, and attach or detach only those on a
          role. Access policies need the current version of the stack; an older stack must be updated first.
        </li>
        <li>It cannot read your data or your own policies, and it cannot change them.</li>
        <li>
          It never touches service-linked roles, AWS reserved roles, AuthSec&apos;s own roles, or a role tagged{" "}
          <span className="font-mono">authsec:protected=true</span>.
        </li>
        <li>Deleting the CloudFormation stack removes AuthSec&apos;s ability to change anything in this account.</li>
      </ul>
    </details>
  );
}

function Checklist({ binding }: { binding: EnforcementBindingView }) {
  const rows = capabilityRows(binding.capabilities);
  const verified = binding.setup_state === "verified";
  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-semibold text-(--color-text)">
        Self-test{" "}
        <span className="font-normal text-(--color-text-muted)">
          {binding.last_self_test_at ? `(${relTime(binding.last_self_test_at)})` : "(not run yet)"}
        </span>
      </h4>
      <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] text-(--color-text)">{r.label}</p>
              {r.status === "ok" || r.status === "untested" ? null : (
                <p className="mt-0.5 break-words text-xs text-(--color-text-muted)">
                  {r.code ? <span className="font-mono">{r.code}</span> : null}
                  {r.code && r.message ? " · " : null}
                  {r.message ?? null}
                  {r.note ? <span className="block">{r.note}</span> : null}
                </p>
              )}
            </div>
            <StatusBadge tone={r.tone} className="shrink-0">
              {r.word}
            </StatusBadge>
          </li>
        ))}
      </ul>
      {verified ? null : <p className="text-[13px] font-medium text-(--color-text)">AuthSec cannot apply changes in this account until every check passes.</p>}
    </div>
  );
}

export function AccountEnforcement({ connection }: { connection: Connection }) {
  const enforce = usePolicyPermission("governance:enforce");
  const [poll, setPoll] = useState(0);
  const binding = useGetEnforcementBindingQuery(connection.id, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const b = binding.data;
  const state = b?.setup_state;
  const waiting = state === "waiting_for_stack";

  // Poll while waiting for the stack or while a worker holds the self-test.
  useEffect(() => {
    setPoll(state === "waiting_for_stack" || state === "verifying" ? POLL_MS : 0);
  }, [state]);

  // The stack registers asynchronously: follow the session and re-read the binding when it moves.
  const session = useGetEnforcementSessionQuery(
    { connectorId: connection.id, sessionId: b?.binding_id ?? "" },
    { skip: !waiting || !b?.binding_id || enforce.refused, pollingInterval: POLL_MS, skipPollingIfUnfocused: true },
  );
  const sessionStatus = session.data?.status;
  const refetchBinding = binding.refetch;
  useEffect(() => {
    if (sessionStatus && sessionStatus !== "waiting_for_stack") void refetchBinding();
  }, [sessionStatus, refetchBinding]);

  const [verify] = useVerifyEnforcementMutation();
  const verifier = usePolicyAction("governance:enforce");
  const [enableOpen, setEnableOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const failure = classifyPolicyError(binding.error);
  useMarkRefused(classifyPolicyError(session.error), "governance:enforce");

  const name = connection.name || connection.native_id;
  const chip = b ? setupStateView(b.setup_state) : null;
  const revokedConnection = connection.connection.state === "revoked";
  const bound = hasBoundRole(b);
  const outdated = bound && !!b?.template_version && b.template_version !== b.current_template_version;

  async function rerun() {
    const view = await verifier.run(() => verify(connection.id));
    if (view) {
      toast[view.setup_state === "verified" ? "success" : "error"](
        view.setup_state === "verified" ? "Self-test passed" : "Self-test finished: not every check passed",
      );
    }
  }

  return (
    <Panel
      title={name}
      description={name !== connection.native_id ? `AWS account ${connection.native_id}` : "AWS account"}
      actions={chip ? <StateChip state={chip} /> : null}
    >
      {binding.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !b ? (
        failure.kind === "forbidden" ? (
          <p className="text-[13px] text-(--color-text-muted)">Your role cannot see enforcement for this account.</p>
        ) : (
          <PolicyLoadFailure failure={failure} subject="the enforcement state" onRetry={() => void binding.refetch()} />
        )
      ) : b ? (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-(--color-text-muted)">{INTRO}</p>

          {revokedConnection ? (
            <p className="text-[13px] text-(--color-warning-text)">
              This AWS connection was revoked, so enforcement cannot be set up.{" "}
              <Link to={`/iga/connections/${encodeURIComponent(connection.id)}`} className="font-medium underline">
                Open the connection
              </Link>
            </p>
          ) : null}

          {state === "off" ? <p className="text-[13px] text-(--color-text)">Enforcement is off for this account.</p> : null}

          {state === "error" && !bound ? (
            <div role="alert" className="rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger-text)">
              <p className="font-medium">The last setup attempt did not finish.</p>
              {b.last_error ? <p className="mt-0.5 break-words">{b.last_error}</p> : null}
              {b.last_error_code ? <p className="mt-0.5 font-mono text-xs">{b.last_error_code}</p> : null}
            </div>
          ) : null}

          {waiting ? (
            <div className="space-y-1 text-[13px]">
              <p className="text-(--color-text)">
                Waiting for the stack to register. After you create it in AWS, this page updates by itself.
              </p>
              {sessionStatus === "expired" ? (
                <p className="text-(--color-warning-text)">The launch link expired. Open AWS again for a new one.</p>
              ) : null}
            </div>
          ) : null}

          {state === "verifying" ? (
            <p role="status" className="text-[13px] text-(--color-text)">
              AuthSec is running the self-test in this account…
            </p>
          ) : null}

          {bound ? <Checklist binding={b} /> : null}

          {bound && state === "error" && b.last_error ? (
            <div role="alert" className="rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger-text)">
              <p className="break-words">{b.last_error}</p>
            </div>
          ) : null}

          {outdated ? (
            <div className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
              <p className="font-medium">Update available</p>
              <p className="mt-0.5">
                This stack uses template {b.template_version}; the current template is {b.current_template_version}. There is no in-place update:
                revoke, then set up again.
              </p>
            </div>
          ) : null}

          {enforce.refused ? (
            <p className="text-xs text-(--color-text-muted)">Your role cannot change enforcement. Ask a workspace administrator.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {state === "off" || (state === "error" && !bound) ? (
                  <Button size="sm" onClick={() => setEnableOpen(true)} disabled={revokedConnection}>
                    {state === "off" ? "Allow AuthSec to change IAM" : "Try again"}
                  </Button>
                ) : null}
                {waiting ? (
                  <>
                    <Button size="sm" onClick={() => setEnableOpen(true)} disabled={revokedConnection}>
                      Open AWS again
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void binding.refetch()} disabled={binding.isFetching}>
                      Check now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)}>
                      Cancel setup
                    </Button>
                  </>
                ) : null}
                {state === "verifying" ? (
                  <Button size="sm" variant="outline" onClick={() => void binding.refetch()} disabled={binding.isFetching}>
                    Check now
                  </Button>
                ) : null}
                {bound ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void rerun()} disabled={verifier.pending || state === "verifying"}>
                      {verifier.pending ? "Verifying…" : "Re-run self-test"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)} disabled={verifier.pending}>
                      Revoke
                    </Button>
                  </>
                ) : null}
                {verifier.pending ? (
                  <span role="status" className="text-xs text-(--color-text-muted)">
                    AuthSec is running the self-test in your account. This can take a minute.
                  </span>
                ) : null}
              </div>
              <PolicyActionError failure={verifier.failure} />
            </div>
          )}

          {bound ? (
            <details className="rounded-md border border-(--color-border-subtle) px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">Roles and stack</summary>
              <Facts className="mt-3">
                {b.stack_name ? (
                  <Fact label="Stack" mono>
                    {b.stack_name}
                  </Fact>
                ) : null}
                {b.role_arn ? (
                  <Fact label="Enforcement role">
                    <CopyValue value={b.role_arn} what="Role ARN" />
                  </Fact>
                ) : null}
                {b.selftest_role_arn ? (
                  <Fact label="Self-test role">
                    <CopyValue value={b.selftest_role_arn} what="Role ARN" />
                  </Fact>
                ) : null}
                {b.template_version ? <Fact label="Template">{b.template_version}</Fact> : null}
                {b.verified_at ? (
                  <Fact label="Last verified">
                    <Timestamp iso={b.verified_at} />
                  </Fact>
                ) : null}
              </Facts>
            </details>
          ) : null}

          <WhatItCanDo />
        </div>
      ) : null}

      <EnableEnforcementDialog connection={connection} open={enableOpen} onOpenChange={setEnableOpen} resuming={waiting} />
      <RevokeEnforcementDialog connection={connection} open={revokeOpen} onOpenChange={setRevokeOpen} cancelSetup={waiting} />
    </Panel>
  );
}

export default function EnforcementSection() {
  const connections = useListDiscoveryConnectionsQuery();
  const accounts = awsAccounts(connections.data);
  const failure = classifyPolicyError(connections.error);

  if (connections.isLoading) {
    return (
      <p role="status" className="text-[13px] text-(--color-text-muted)">
        Loading AWS accounts…
      </p>
    );
  }
  if (failure && !connections.data) {
    return <PolicyLoadFailure failure={failure} subject="AWS accounts" onRetry={() => void connections.refetch()} />;
  }
  if (accounts.length === 0) {
    return (
      <Panel title="No AWS accounts connected">
        <p className="text-[13px] text-(--color-text-muted)">
          Enforcement is set up per AWS account. Connect an account first, then come back here.{" "}
          <Link to="/iga/connections" className="font-medium text-(--color-primary-text) underline">
            Open Accounts
          </Link>
        </p>
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      {accounts.map((c) => (
        <AccountEnforcement key={c.id} connection={c} />
      ))}
    </div>
  );
}
