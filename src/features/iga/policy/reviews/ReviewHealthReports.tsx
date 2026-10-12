/**
 * After rollout starts, an owner's page also carries **Report a problem** and
 * **It's working** (SPEC-iga-phase3-policy.md §9.3 S4, §7.6). Both post to
 * `POST /deployments/:id/health-reports`; a problem report feeds the canary's
 * `no_problem_reports` gate, a "working" report is recorded as the owner's
 * word. The server allows an owner of a consumer of the role, or a holder of
 * `governance:author`; anyone else is refused in words.
 *
 * Shown only when the reviewed version has a deployment: the deployments of the
 * policy are read (needs `governance:read`) and filtered to this version's
 * forward deployments. When that read is refused or fails the section is
 * absent, never an invented "no deployments" statement.
 */

import { useState } from "react";

import { useCreateGovDeploymentHealthReportMutation, useListGovDeploymentsQuery } from "@/app/api/igaPolicyDeploymentsApi";
import type { GovHealthReportKind } from "@/app/api/igaPolicyDeploymentsApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";

import { PolicyActionError, StateChip, deploymentState, roleNameOf, usePolicyAction } from "../shared";

interface Target {
  id: string;
  roleArn: string;
  state: string;
}

export function ReviewHealthReports({ ws, policyId, versionNo }: { ws: string; policyId: string; versionNo: number }) {
  const list = useListGovDeploymentsQuery({ ws, policy_id: policyId, limit: 200 });
  const [report] = useCreateGovDeploymentHealthReportMutation();
  const { run, pending, failure, clear } = usePolicyAction();
  const [target, setTarget] = useState<Target | null>(null);
  const [kind, setKind] = useState<GovHealthReportKind>("problem");
  const [service, setService] = useState("");
  const [detail, setDetail] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const rows = (list.data?.data ?? []).filter((d) => d.version_no === versionNo && (d.kind === "apply" || d.kind === "split"));
  if (rows.length === 0) return null;

  function open(t: Target, k: GovHealthReportKind) {
    clear();
    setKind(k);
    setService("");
    setDetail("");
    setTarget(t);
  }

  async function submit() {
    if (!target) return;
    const res = await run(() => report({ id: target.id, kind, service: service.trim() || undefined, detail: detail.trim() }));
    if (res) {
      setSent(
        kind === "problem"
          ? `Your report about ${roleNameOf(target.roleArn)} was recorded. It fails the canary's no-problem-reports gate.`
          : `Recorded: ${roleNameOf(target.roleArn)} is working for you.`,
      );
      setTarget(null);
    }
  }

  return (
    <Panel
      title="After rollout"
      description="Tell AuthSec how the change is going for what you own. A problem report feeds a canary gate; reports do not undo anything by themselves."
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {rows.map((d) => {
          const t = { id: d.id, roleArn: d.role_arn, state: d.state };
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-(--color-text)">{roleNameOf(d.role_arn)}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <StateChip state={deploymentState(d.state)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open(t, "problem")}>
                  Report a problem
                </Button>
                <Button size="sm" variant="outline" onClick={() => open(t, "working")}>
                  It&apos;s working
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {sent ? (
        <p role="status" className="mt-2 text-xs text-(--color-success-text)">
          {sent}
        </p>
      ) : null}
      <Meta className="mt-2">A deployment state of &ldquo;Verified&rdquo; means the boundary in AWS matches the plan. It does not say your application is healthy; only you can.</Meta>

      <Dialog open={target !== null} onOpenChange={(o) => (pending ? undefined : o ? undefined : setTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === "problem" ? "Report a problem" : "Say it's working"}</DialogTitle>
            <DialogDescription>
              {target ? `About ${roleNameOf(target.roleArn)}. ` : ""}
              {kind === "problem"
                ? "Describe what stopped working. A problem report made after the change was applied fails the canary's no-problem-reports gate."
                : "Optional detail. This records that, for what you own, the change is not causing trouble."}
            </DialogDescription>
          </DialogHeader>
          <label className="block text-xs text-(--color-text-muted)">
            Service affected (optional)
            <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="sqs" className="mt-1" />
          </label>
          <label className="block text-xs text-(--color-text-muted)">
            {kind === "problem" ? "What happened (required)" : "Detail (optional)"}
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className="mt-1" />
          </label>
          <PolicyActionError failure={failure}>
            {failure?.code === "not_consumer_owner" ? <p className="mt-1">Only an owner of something that runs as this role, or a person who can author policy, can report on it.</p> : null}
          </PolicyActionError>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={pending || (kind === "problem" && detail.trim() === "")}>
              {kind === "problem" ? "Send report" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
