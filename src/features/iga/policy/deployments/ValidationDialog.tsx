/**
 * Declare a test call (SPEC-iga-phase3-policy.md §7.6, §8.7 "Declared
 * validations"). A deliberate test is declared before it runs: each action with
 * the outcome expected, the correlation (an assumed session AuthSec names, or a
 * dedicated test workload) and the window. AuthSec returns the session name the
 * test must use; calls made under it are matched to the declared items in
 * CloudTrail. Results: matched, not seen, contradicted. A declared expected
 * denial is the only denial the no-unexpected-failures gate excuses.
 */

import { format } from "date-fns";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useDeclareGovDeploymentValidationMutation,
  type GovExpectedOutcome,
  type GovValidationCorrelation,
  type GovValidationView,
} from "@/app/api/igaPolicyDeploymentsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyValue } from "@/features/iga/shared/components/Panel";

import { usePolicyAction } from "../shared";
import { ActionFrame } from "./ActionFrame";
import { stamp } from "./deploymentModel";

const ACTION_RE = /^[a-z0-9-]+:[A-Za-z0-9]+$/;
const LOCAL = "yyyy-MM-dd'T'HH:mm";

interface Item {
  key: number;
  action: string;
  expected: GovExpectedOutcome;
}

function defaultWindow(): { start: string; end: string } {
  const now = new Date();
  return { start: format(now, LOCAL), end: format(new Date(now.getTime() + 60 * 60 * 1000), LOCAL) };
}

export function ValidationDialog({
  deploymentId,
  roleName,
  open,
  onOpenChange,
}: {
  deploymentId: string;
  roleName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [declare] = useDeclareGovDeploymentValidationMutation();
  const { run, pending, failure, clear } = usePolicyAction("governance:author");
  const [items, setItems] = useState<Item[]>([{ key: 1, action: "", expected: "denied" }]);
  const [nextKey, setNextKey] = useState(2);
  const [correlation, setCorrelation] = useState<GovValidationCorrelation>("assumed_session");
  const [workloadId, setWorkloadId] = useState("");
  const [win, setWin] = useState(defaultWindow);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<GovValidationView | null>(null);

  useEffect(() => {
    if (!open) {
      setItems([{ key: 1, action: "", expected: "denied" }]);
      setNextKey(2);
      setCorrelation("assumed_session");
      setWorkloadId("");
      setWin(defaultWindow());
      setNote("");
      setResult(null);
      clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const actions = items.map((i) => i.action.trim());
  const badAction = (a: string) => a !== "" && !ACTION_RE.test(a);
  const duplicate = new Set(actions).size !== actions.length;
  const start = new Date(win.start);
  const end = new Date(win.end);
  const windowOk = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
  const valid =
    actions.every((a) => a !== "" && !badAction(a)) && !duplicate && windowOk && (correlation === "assumed_session" || workloadId.trim() !== "");

  async function submit() {
    const res = await run(() =>
      declare({
        id: deploymentId,
        items: items.map((i) => ({ action: i.action.trim(), expected: i.expected })),
        correlation,
        dedicated_workload_id: correlation === "dedicated_workload" ? workloadId.trim() : undefined,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        note: note.trim() || undefined,
      }),
    );
    if (res) {
      setResult(res);
      toast.success("Test call declared");
    }
  }

  if (result) {
    const session = result.session_name;
    return (
      <ActionFrame open={open} onOpenChange={onOpenChange} title="Test call declared" description={`On ${roleName}, ${stamp(result.window_start)} to ${stamp(result.window_end)}.`}>
        {result.correlation === "assumed_session" ? (
          <>
            <p>Assume the role with exactly this session name, then make the declared calls inside the window:</p>
            <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2">
              <CopyValue value={session} what="Session name" />
            </div>
            <p className="text-(--color-text-muted)">
              Use it as the <code className="font-mono text-xs">RoleSessionName</code>, for example{" "}
              <code className="font-mono text-xs">aws sts assume-role --role-session-name {session} …</code>. The role&apos;s trust policy must allow
              you to assume it.
            </p>
          </>
        ) : (
          <p>
            Make the declared calls from the test workload{session ? ` named ${session}` : ""}, inside the window. Its sessions are matched by that
            name.
          </p>
        )}
        <ul className="list-disc space-y-0.5 pl-5">
          {result.items.map((i) => (
            <li key={i.action}>
              <code className="font-mono text-xs">{i.action}</code>: expected {i.expected}
            </li>
          ))}
        </ul>
        <p className="text-(--color-text-muted)">
          Results appear on the deployment after the next CloudTrail read: matched, not seen, or contradicted. Calls that are not declared here are
          ordinary traffic.
        </p>
      </ActionFrame>
    );
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Declare a test call"
      description={`Prove what the change on ${roleName} does, with calls you declare before making them.`}
      confirmLabel="Declare test call"
      busyLabel="Declaring…"
      pending={pending}
      failure={failure}
      onConfirm={() => void submit()}
      confirmDisabled={!valid}
    >
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Calls and what you expect</legend>
        {items.map((i, idx) => (
          <div key={i.key} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Action ${idx + 1}`}
                placeholder="sqs:ListQueues"
                value={i.action}
                onChange={(e) => setItems((xs) => xs.map((x) => (x.key === i.key ? { ...x, action: e.target.value } : x)))}
                className="min-w-[12rem] flex-1 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={badAction(actions[idx])}
              />
              <select
                aria-label={`Expected outcome for action ${idx + 1}`}
                value={i.expected}
                onChange={(e) => setItems((xs) => xs.map((x) => (x.key === i.key ? { ...x, expected: e.target.value as GovExpectedOutcome } : x)))}
                className="h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-sm"
              >
                <option value="denied">Expected: denied</option>
                <option value="allowed">Expected: allowed</option>
              </select>
              {items.length > 1 ? (
                <Button variant="ghost" size="icon" aria-label={`Remove action ${idx + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))}>
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            {badAction(actions[idx]) ? <p className="text-xs text-(--color-danger-text)">Use an IAM action such as sqs:ListQueues.</p> : null}
          </div>
        ))}
        {duplicate ? <p className="text-xs text-(--color-danger-text)">Each action can be declared once.</p> : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setItems((xs) => [...xs, { key: nextKey, action: "", expected: "denied" }]);
            setNextKey((n) => n + 1);
          }}
        >
          <Plus className="size-3.5" /> Add a call
        </Button>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">How the calls are tied to this test</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="val-corr" className="mt-1" checked={correlation === "assumed_session"} onChange={() => setCorrelation("assumed_session")} />
          <span>
            <span className="font-medium">An assumed session.</span> AuthSec names the session; you assume the role with that name.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="val-corr" className="mt-1" checked={correlation === "dedicated_workload"} onChange={() => setCorrelation("dedicated_workload")} />
          <span>
            <span className="font-medium">A dedicated test workload</span> that runs as this role (for example a separate Lambda function).
          </span>
        </label>
        {correlation === "dedicated_workload" ? (
          <div className="space-y-1 pl-6">
            <label htmlFor="val-workload" className="text-xs font-medium">
              Workload id (from Discovery)
            </label>
            <Input id="val-workload" value={workloadId} onChange={(e) => setWorkloadId(e.target.value)} className="font-mono text-xs" autoComplete="off" />
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="val-start" className="text-xs font-medium">
            Window starts
          </label>
          <Input id="val-start" type="datetime-local" value={win.start} onChange={(e) => setWin((w) => ({ ...w, start: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label htmlFor="val-end" className="text-xs font-medium">
            Window ends
          </label>
          <Input id="val-end" type="datetime-local" value={win.end} onChange={(e) => setWin((w) => ({ ...w, end: e.target.value }))} />
        </div>
      </div>
      {!windowOk ? <p className="text-xs text-(--color-danger-text)">The window must end after it starts.</p> : null}

      <div className="space-y-1">
        <label htmlFor="val-note" className="text-xs font-medium">
          Note (optional)
        </label>
        <Input id="val-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>
    </ActionFrame>
  );
}
