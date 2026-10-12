/**
 * Except a finding for a time, or clear the exception (SPEC-iga-phase3-policy.md
 * §2.5, §7.1; `governance:author`). An exception is time-bound: it ends on the
 * date chosen (at most a year ahead), then the finding is open again. It stops a
 * proposal from using the finding and, if a version removes a service whose
 * finding is excepted, the owner gate refuses it until the exception is cleared.
 * Only an open, reopened or already excepted finding can be excepted; the server
 * says so for the others and the dialog shows its words.
 */

import { useState } from "react";

import {
  GOV_MAX_EXCEPTION_DAYS,
  useClearGovFindingExceptionMutation,
  useExceptGovFindingMutation,
} from "@/app/api/igaPolicyFindingRulesApi";
import type { GovFindingDetail } from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Meta } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { PolicyActionError, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionDialog } from "../setup/ActionDialog";

const DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of a day offset from now, in the viewer's calendar. */
function dateInDays(n: number): string {
  const d = new Date(Date.now() + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The exception runs to the end of the chosen day, as an instant the server parses (RFC 3339, UTC). */
function endOfDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function FindingException({ finding: f }: { finding: GovFindingDetail }) {
  const author = usePolicyPermission("governance:author");
  const [except] = useExceptGovFindingMutation();
  const [clear] = useClearGovFindingExceptionMutation();
  const exceptAction = usePolicyAction("governance:author");
  const clearAction = usePolicyAction("governance:author");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => dateInDays(90));
  const [reason, setReason] = useState("");

  const status = f.current.status;
  const excepted = status === "excepted";
  const canChange = status === "open" || status === "reopened" || excepted;
  if (!excepted && !(author.offered && canChange)) return null;

  const min = dateInDays(1);
  const max = dateInDays(GOV_MAX_EXCEPTION_DAYS - 1);
  const dateOk = date >= min && date <= max;

  async function save() {
    const res = await exceptAction.run(() => except({ id: f.id, until: endOfDay(date), reason: reason.trim() }));
    if (res) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <section aria-labelledby="finding-exception" className="space-y-2">
      <h3 id="finding-exception" className="text-[13px] font-semibold text-foreground">
        {excepted ? "Excepted" : "Not acting on this now?"}
      </h3>
      {excepted ? (
        <p className="text-[13px] text-(--color-text)">
          Excepted until {f.current.excepted_until ? <Timestamp iso={f.current.excepted_until} /> : "a date that was not recorded"}
          {f.current.exception_reason ? `: ${f.current.exception_reason}` : "."} It becomes open again then, if the condition still holds.
        </p>
      ) : (
        <Meta>
          An exception keeps this finding out of new proposals until the date you choose, then it opens again. It is recorded with your name and reason.
        </Meta>
      )}
      {author.offered ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>
            {excepted ? "Change the exception…" : "Except this finding…"}
          </Button>
          {excepted ? (
            <Button variant="outline" disabled={clearAction.pending} onClick={() => void clearAction.run(() => clear({ id: f.id }))}>
              Clear the exception
            </Button>
          ) : null}
        </div>
      ) : null}
      <PolicyActionError failure={clearAction.failure} />
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Except this finding?"
        description="The finding stays out of new proposals until the date you choose. Then it opens again if the condition still holds."
        confirmLabel="Record exception"
        busyLabel="Recording…"
        pending={exceptAction.pending}
        failure={exceptAction.failure}
        confirmDisabled={!dateOk || reason.trim() === ""}
        onConfirm={() => void save()}
      >
        <label className="block text-[13px] font-medium" htmlFor="finding-exception-until">
          Until
        </label>
        <Input id="finding-exception-until" type="date" value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} />
        {!dateOk ? <p className="text-xs text-(--color-danger-text)">Choose a day from tomorrow to a year from now.</p> : null}
        <label className="block text-[13px] font-medium" htmlFor="finding-exception-reason">
          Reason (required)
        </label>
        <Textarea
          id="finding-exception-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="The service is needed for the quarter-end run and is reviewed in January"
        />
      </ActionDialog>
    </section>
  );
}
