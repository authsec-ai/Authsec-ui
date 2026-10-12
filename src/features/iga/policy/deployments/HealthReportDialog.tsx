/**
 * Report on an applied change (SPEC-iga-phase3-policy.md §7.6, §8.6): a
 * `problem` fails the canary's no-problem-reports gate; `working` is an
 * owner's word that a kept service still works, which counts as success
 * evidence for `required_operations`. The server allows an owner of a
 * consumer of the role or a holder of governance:author (403
 * not_consumer_owner otherwise) and always records channel `ui`.
 */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { useCreateGovDeploymentHealthReportMutation, type GovHealthReportKind } from "@/app/api/igaPolicyDeploymentsApi";
import { Input } from "@/components/ui/input";

import { usePolicyAction } from "../shared";
import { ActionFrame, ReasonField } from "./ActionFrame";

export function HealthReportDialog({
  deploymentId,
  roleName,
  initialKind = "problem",
  open,
  onOpenChange,
}: {
  deploymentId: string;
  roleName: string;
  initialKind?: GovHealthReportKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [report] = useCreateGovDeploymentHealthReportMutation();
  const { run, pending, failure, clear } = usePolicyAction();
  const [kind, setKind] = useState<GovHealthReportKind>(initialKind);
  const [service, setService] = useState("");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (open) {
      setKind(initialKind);
    } else {
      setService("");
      setDetail("");
      clear();
    }
    // `clear` only resets local state; opening and closing are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind]);

  async function submit() {
    const res = await run(() => report({ id: deploymentId, kind, service: service.trim() || undefined, detail: detail.trim() }));
    if (res) {
      toast.success(kind === "problem" ? "Problem reported" : "Recorded as working");
      onOpenChange(false);
    }
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Report on this change"
      description={`How ${roleName} and what depends on it are doing since the change.`}
      confirmLabel="Send report"
      busyLabel="Sending…"
      pending={pending}
      failure={failure}
      onConfirm={() => void submit()}
      confirmDisabled={kind === "problem" && !detail.trim()}
    >
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">What are you reporting?</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="report-kind" className="mt-1" checked={kind === "problem"} onChange={() => setKind("problem")} />
          <span>
            <span className="font-medium">A problem.</span> Something stopped working. This fails the canary&apos;s no-problem-reports gate and pauses
            expansion.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="report-kind" className="mt-1" checked={kind === "working"} onChange={() => setKind("working")} />
          <span>
            <span className="font-medium">It is working.</span> A kept service still works. This is your word; it counts as success evidence for that
            service.
          </span>
        </label>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="report-service" className="text-xs font-medium">
          Service (optional, for example s3)
        </label>
        <Input id="report-service" value={service} onChange={(e) => setService(e.target.value)} maxLength={64} className="w-48" autoComplete="off" />
      </div>
      <ReasonField
        id="report-detail"
        label={kind === "problem" ? "What happened" : "What you saw"}
        value={detail}
        onChange={setDetail}
        required={kind === "problem"}
      />
    </ActionFrame>
  );
}
