/**
 * Enable enforcement for one AWS account (SPEC-iga-phase3-policy.md §3.6, §7.9,
 * §9.3 S9). Quick Create: start a session, send the person to AWS's own
 * CloudFormation console with the link the server built, and poll the session
 * until the stack registers. The manual path (deploy the template by hand and
 * post two role ARNs) sits behind a disclosure; the ExternalId is rendered only
 * while that disclosure is open and is never logged. The launch link the server
 * builds carries it as a stack parameter, as AWS Quick Create requires. It is
 * kept in this dialog's state only: the polling answer is stripped of it before
 * it reaches the shared cache, and closing the dialog clears the state.
 *
 * The link is the server's `quick_create_url`, opened only when it is an
 * https address on AWS's console; the dialog never builds one.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import type { Connection } from "@/app/api/connectionsApi";
import {
  useBindEnforcementManualMutation,
  useGetEnforcementSessionQuery,
  useStartEnforcementSessionMutation,
  type EnforcementSession,
} from "@/app/api/igaPolicySetupApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyValue } from "@/features/iga/shared/components/Panel";

import { usePolicyAction, relTime, type PolicyFailure } from "../shared";
import { ActionDialog } from "./ActionDialog";
import { isAwsConsoleUrl, roleArnProblem } from "./enforcementModel";

const POLL_MS = 4_000;

function StatusLine({ status, message, code }: { status: string; message?: string; code?: string }) {
  let text: string;
  let busy = false;
  let tone = "text-(--color-text-muted)";
  switch (status) {
    case "waiting_for_stack":
      text = "Waiting for the stack to register. This page updates by itself.";
      busy = true;
      break;
    case "verifying":
      text = "The stack registered. Running the self-test…";
      busy = true;
      break;
    case "verified":
      text = "Enforcement is on and verified for this account.";
      tone = "text-(--color-success-text)";
      break;
    case "partial":
      text = "The stack registered, but some self-test checks failed. AuthSec will not apply changes here until every check passes.";
      tone = "text-(--color-warning-text)";
      break;
    case "error":
      text = `AuthSec could not use the enforcement role.${message ? ` ${message}` : ""}${code ? ` (${code})` : ""}`;
      tone = "text-(--color-danger-text)";
      break;
    case "expired":
      text = "This launch link has expired. Close this dialog and choose Enable enforcement again.";
      tone = "text-(--color-warning-text)";
      break;
    case "revoked":
      text = "This setup was revoked.";
      break;
    default:
      text = "Waiting for the stack to register.";
  }
  return (
    <p role="status" aria-live="polite" className={`flex items-start gap-2 text-[13px] ${tone}`}>
      {busy ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
      <span>{text}</span>
    </p>
  );
}

function ManualPath({
  connection,
  session,
  onBound,
  onBusyChange,
  setFailure,
}: {
  connection: Connection;
  session: EnforcementSession;
  onBound: () => void;
  onBusyChange: (busy: boolean) => void;
  setFailure: (f: PolicyFailure | null) => void;
}) {
  const [bind] = useBindEnforcementManualMutation();
  const action = usePolicyAction("governance:enforce");
  const [role, setRole] = useState("");
  const [selftest, setSelftest] = useState("");
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(false);
  const account = session.account_id || connection.native_id;

  const roleProblem = roleArnProblem(role, account, "");
  const selftestProblem = roleArnProblem(selftest, account, session.selftest_role_name);

  useEffect(() => {
    onBusyChange(action.pending);
  }, [action.pending, onBusyChange]);
  useEffect(() => {
    setFailure(action.failure);
  }, [action.failure, setFailure]);

  const params = session.stack_parameters ?? {};
  const rows: [string, string | undefined][] = [
    ["AuthSecPrincipalArn", params.AuthSecPrincipalArn],
    ["ExternalId", session.external_id ?? params.ExternalId],
    ["NameSuffix", params.NameSuffix ?? session.suffix],
  ];

  async function submit() {
    setTouched(true);
    if (roleProblem || selftestProblem) return;
    // Synchronous: AuthSec assumes the role and runs the whole self-test before it answers.
    const view = await action.run(() => bind({ connectorId: connection.id, role_arn: role.trim(), selftest_role_arn: selftest.trim() }));
    if (view) {
      toast.success(view.setup_state === "verified" ? "Enforcement verified" : "Roles bound; see the self-test result");
      onBound();
    }
  }

  return (
    <details
      className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2"
      onToggle={(e) => setShown(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">Set up by hand instead</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-(--color-text-muted)">
          Deploy AuthSec&apos;s enforcement template ({session.template_version}) as a CloudFormation stack named{" "}
          <span className="font-mono">{session.stack_name}</span> with these parameters, then paste the two role ARNs the stack outputs.
          {session.template_url && /^https:\/\//.test(session.template_url) ? (
            <>
              {" "}
              <a href={session.template_url} target="_blank" rel="noopener noreferrer" className="font-medium text-(--color-primary-text) underline">
                Open the template
              </a>
              .
            </>
          ) : null}
        </p>
        <dl className="space-y-2">
          {(shown ? rows : []).map(([name, value]) =>
            value ? (
              <div key={name}>
                <dt className="text-xs text-(--color-text-muted)">
                  {name}
                  {name === "ExternalId" ? " (paste it only into this stack; do not share it)" : ""}
                </dt>
                <dd>
                  <CopyValue value={value} what={name} />
                </dd>
              </div>
            ) : null,
          )}
        </dl>
        <div className="space-y-1">
          <label htmlFor="enf-role-arn" className="text-xs font-medium text-(--color-text)">
            Enforcement role ARN (stack output RoleArn)
          </label>
          <Input
            id="enf-role-arn"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={`arn:aws:iam::${account}:role/${session.role_name}`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={touched && !!roleProblem}
          />
          {touched && roleProblem ? <p className="text-xs text-(--color-danger-text)">{roleProblem}</p> : null}
        </div>
        <div className="space-y-1">
          <label htmlFor="enf-selftest-arn" className="text-xs font-medium text-(--color-text)">
            Self-test role ARN (stack output SelfTestRoleArn)
          </label>
          <Input
            id="enf-selftest-arn"
            value={selftest}
            onChange={(e) => setSelftest(e.target.value)}
            placeholder={`arn:aws:iam::${account}:role/${session.selftest_role_name}`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={touched && !!selftestProblem}
          />
          {touched && selftestProblem ? <p className="text-xs text-(--color-danger-text)">{selftestProblem}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void submit()} disabled={action.pending}>
            {action.pending ? "Verifying…" : "Bind and verify"}
          </Button>
          {action.pending ? (
            <span role="status" className="text-xs text-(--color-text-muted)">
              AuthSec is assuming the role and running the self-test. This can take a minute.
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export function EnableEnforcementDialog({
  connection,
  open,
  onOpenChange,
  resuming = false,
}: {
  connection: Connection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account is already waiting for its stack: this asks for a fresh AWS link. */
  resuming?: boolean;
}) {
  const [start, startResult] = useStartEnforcementSessionMutation();
  const starter = usePolicyAction("governance:enforce");
  const [session, setSession] = useState<EnforcementSession | null>(null);
  const [manualFailure, setManualFailure] = useState<PolicyFailure | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  // Polls until the stack registers or the link expires. The account's card follows the same session and re-reads the binding.
  const [polling, setPolling] = useState(true);

  // A closed dialog forgets its session: the ExternalId is not kept in state past the dialog.
  // The mutation's cached answer carries it too, so that is reset with the state.
  const resetStart = startResult.reset;
  useEffect(() => {
    if (!open) {
      setSession(null);
      setManualFailure(null);
      setPolling(true);
      resetStart();
      starter.clear();
    }
    // `starter.clear` is a fresh closure each render; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetStart]);

  const sessionId = session?.id ?? "";
  const live = useGetEnforcementSessionQuery(
    { connectorId: connection.id, sessionId },
    { skip: !open || !session, pollingInterval: polling ? POLL_MS : 0, skipPollingIfUnfocused: true },
  );
  const status = live.data?.status ?? session?.status ?? "waiting_for_stack";
  useEffect(() => {
    setPolling(status === "waiting_for_stack");
  }, [status]);

  async function begin() {
    const s = await starter.run(() => start({ connectorId: connection.id }));
    if (s) setSession(s);
  }

  // The poll answers without the launch link and template: keep what the start returned and take the rest from the poll.
  const merged: EnforcementSession | null = session
    ? { ...session, ...(live.data ?? {}), quick_create_url: session.quick_create_url, template_url: session.template_url, automatic: session.automatic, automatic_reason: session.automatic_reason }
    : null;
  const url = merged?.quick_create_url;
  const canOpen = !!merged?.automatic && isAwsConsoleUrl(url);
  const name = connection.name || connection.native_id;

  if (!session) {
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title={resuming ? "Get a new AWS link" : "Enable enforcement"}
        description={`Account ${connection.native_id}${name !== connection.native_id ? ` · ${name}` : ""}`}
        confirmLabel={resuming ? "Get link" : "Prepare AWS stack"}
        busyLabel="Preparing…"
        pending={starter.pending}
        failure={starter.failure}
        onConfirm={() => void begin()}
      >
        <p>
          AuthSec will prepare a CloudFormation stack for this account. It creates two IAM roles: an enforcement role that can only create,
          version, attach and remove AuthSec-owned permissions boundaries (policies under <span className="font-mono">/authsec/</span>), and a
          self-test role AuthSec uses to prove that.
        </p>
        <p>It cannot read your data, read your policies or change your own policies.</p>
        <p className="text-(--color-text-muted)">
          Nothing changes in AWS until you review and create the stack there. Even then, AuthSec applies nothing until a person approves a
          change and the workspace is switched to enforce.
        </p>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create the stack in AWS"
      description={`Account ${connection.native_id}${name !== connection.native_id ? ` · ${name}` : ""}`}
      pending={manualBusy}
      failure={manualFailure}
      wide
    >
      {canOpen && url ? (
        <div className="space-y-2">
          <Button asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open AWS CloudFormation
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <ol className="list-decimal space-y-1 pl-5 text-(--color-text-muted)">
            <li>
              Review the stack in the AWS console{merged?.deployment_region ? ` (region ${merged.deployment_region})` : ""}. Its parameters are
              already filled in.
            </li>
            <li>Tick the acknowledgement that it creates IAM resources, then choose Create stack.</li>
            <li>Come back here. AuthSec detects the stack and runs the self-test.</li>
          </ol>
          {merged?.expires_at && Date.parse(merged.expires_at) > Date.now() ? (
            <p className="text-xs text-(--color-text-muted)">The link is valid {relTime(merged.expires_at).replace(/^in /, "for ")}.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-(--color-warning-text)">
          Automatic setup is not available: {merged?.automatic_reason || "the server did not return an AWS launch link"}. Use the manual path below.
        </p>
      )}
      <StatusLine status={status} message={live.data?.message} code={live.data?.code} />
      {merged ? (
        <ManualPath
          connection={connection}
          session={merged}
          onBound={() => void live.refetch()}
          onBusyChange={setManualBusy}
          setFailure={setManualFailure}
        />
      ) : null}
    </ActionDialog>
  );
}
