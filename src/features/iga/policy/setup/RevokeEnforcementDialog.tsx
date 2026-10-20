/**
 * Revoke enforcement for one AWS account (SPEC-iga-phase3-policy.md §7.9, §9.3
 * S9: "Turning off lists the boundaries AuthSec still owns"). Revoking changes
 * nothing in AWS: new direct deployments are blocked, the stack and every
 * boundary stay until the customer removes them. The boundaries cannot be
 * listed before the request (no route reads them), so the dialog says what is
 * true in general, then lists exactly what the server reports after revoking.
 */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import type { Connection } from "@/app/api/connectionsApi";
import { useRevokeEnforcementMutation, type EnforcementRevokeResult } from "@/app/api/igaPolicySetupApi";
import { Textarea } from "@/components/ui/textarea";
import { CopyValue } from "@/features/iga/shared/components/Panel";

import { humanize, usePolicyAction } from "../shared";
import { ActionDialog } from "./ActionDialog";

export function RevokeEnforcementDialog({
  connection,
  open,
  onOpenChange,
  cancelSetup = false,
}: {
  connection: Connection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account is still waiting for its stack: nothing is bound yet. */
  cancelSetup?: boolean;
}) {
  const [revoke] = useRevokeEnforcementMutation();
  const action = usePolicyAction("governance:enforce");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<EnforcementRevokeResult | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setResult(null);
      action.clear();
    }
    // `action.clear` is stable per render of the hook; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    const res = await action.run(() => revoke({ connectorId: connection.id, reason }));
    if (res) {
      setResult(res);
      toast.success(cancelSetup ? "Setup cancelled" : "Enforcement revoked");
    }
  }

  const name = connection.name || connection.native_id;
  const description = `Account ${connection.native_id}${name !== connection.native_id ? ` · ${name}` : ""}`;

  if (result) {
    const artifacts = result.artifacts_in_aws ?? [];
    return (
      <ActionDialog
        open={open}
        onOpenChange={onOpenChange}
        title={cancelSetup ? "Setup cancelled" : "Enforcement revoked"}
        description={description}
        wide
      >
        <p>New direct deployments in this account are blocked. Nothing was changed in AWS.</p>
        {artifacts.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium">
              {artifacts.length} AuthSec-owned {artifacts.length === 1 ? "boundary is" : "boundaries are"} still in the account:
            </p>
            <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
              {artifacts.map((a) => (
                <li key={a.id} className="space-y-1 px-3 py-2">
                  <p className="text-xs text-(--color-text-muted)">
                    {humanize(a.kind)} · {humanize(a.state)}
                  </p>
                  <CopyValue value={a.native_arn} what="ARN" />
                </li>
              ))}
            </ul>
            <p className="text-(--color-text-muted)">
              They stay attached to their roles and keep restricting them. Removing one through AuthSec needs enforcement set up again; or
              you can detach and delete it in AWS yourself.
            </p>
          </div>
        ) : (
          <p className="text-(--color-text-muted)">AuthSec's records show no boundary attached in this account. It does not read AWS again here.</p>
        )}
        <p className="text-(--color-text-muted)">
          The enforcement stack and its two roles remain in your account until you delete the CloudFormation stack. Deleting it removes AuthSec&apos;s
          ability to change anything there.
        </p>
      </ActionDialog>
    );
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={cancelSetup ? "Cancel setup" : "Revoke enforcement"}
      description={description}
      confirmLabel={cancelSetup ? "Cancel setup" : "Revoke enforcement"}
      busyLabel="Revoking…"
      destructive
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void confirm()}
      wide
    >
      {cancelSetup ? (
        <p>AuthSec stops waiting for the stack. If you already created it in AWS, it stays there until you delete it.</p>
      ) : (
        <>
          <p>
            New direct deployments to this account are blocked until enforcement is set up and verified again.
          </p>
          <p>
            Revoking changes nothing in AWS. Every permissions boundary AuthSec attached stays attached and keeps restricting its role, and the
            CloudFormation stack stays until you delete it. After you revoke, this dialog lists the boundaries AuthSec still owns in the account.
          </p>
          <p className="text-(--color-text-muted)">
            To use a newer template, revoke and then set up again; there is no in-place update.
          </p>
        </>
      )}
      <div className="space-y-1">
        <label htmlFor="enf-revoke-reason" className="text-xs font-medium text-(--color-text)">
          Reason (optional, kept in the audit trail)
        </label>
        <Textarea id="enf-revoke-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
    </ActionDialog>
  );
}
