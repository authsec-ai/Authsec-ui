/**
 * Policy › Setup › Owner rules (SPEC-iga-phase3-policy.md §2.9, §7.2): an AWS tag
 * key whose value, on a role or workload, is the email of the person who owns
 * it. The server matches the value, trimmed and case-insensitively, against ONE
 * active workspace member; a value that names nobody, or more than one member,
 * assigns no one and the object shows as "no owner" with the unmatched
 * `key=value`. A rule is applied by a background job right after it is created
 * and again at every publication; deleting a rule removes the owners it assigned.
 * Needs `iga:admin`.
 */

import { useState } from "react";

import {
  OWNER_RULE_APPLIES_TO,
  OWNER_ROLES,
  useCreateGovOwnerRuleMutation,
  useDeleteGovOwnerRuleMutation,
  useListGovOwnerRulesQuery,
  type GovOwnerRole,
  type GovOwnerRule,
  type GovOwnerRuleAppliesTo,
} from "@/app/api/igaPolicyReadsApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, classifyPolicyError, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionDialog } from "./ActionDialog";

const APPLIES_LABEL: Record<GovOwnerRuleAppliesTo, string> = {
  both: "Roles and workloads",
  identity_account: "Roles",
  workload: "Workloads",
};
const ROLE_LABEL: Record<GovOwnerRole, string> = { accountable: "Accountable owner", technical: "Technical owner" };

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [create] = useCreateGovOwnerRuleMutation();
  const action = usePolicyAction("iga:admin");
  const [tag, setTag] = useState("");
  const [applies, setApplies] = useState<GovOwnerRuleAppliesTo>("both");
  const [role, setRole] = useState<GovOwnerRole>("accountable");
  const tagKey = tag.trim();
  const tagOk = tagKey.length > 0 && tagKey.length <= 128;

  async function save() {
    const res = await action.run(() => create({ tag_key: tagKey, applies_to: applies, role }));
    if (res) {
      onOpenChange(false);
      setTag("");
    }
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add an owner rule"
      description="AuthSec reads this AWS tag on roles and workloads and assigns the member whose email is the tag's value."
      confirmLabel="Add rule"
      busyLabel="Adding…"
      pending={action.pending}
      failure={action.failure}
      confirmDisabled={!tagOk}
      onConfirm={() => void save()}
    >
      <div className="space-y-1">
        <label className="block text-[13px] font-medium" htmlFor="owner-rule-tag">
          AWS tag key
        </label>
        <Input id="owner-rule-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="owner" maxLength={128} />
        <p className="text-xs text-(--color-text-muted)">The tag&apos;s value must be one member&apos;s email address.</p>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">Applies to</legend>
        {OWNER_RULE_APPLIES_TO.map((a) => (
          <label key={a} className="flex items-center gap-2 text-[13px]">
            <input type="radio" name="owner-rule-applies" checked={applies === a} onChange={() => setApplies(a)} />
            {APPLIES_LABEL[a]}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">They become the</legend>
        {OWNER_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-[13px]">
            <input type="radio" name="owner-rule-role" checked={role === r} onChange={() => setRole(r)} />
            {ROLE_LABEL[r]}
          </label>
        ))}
      </fieldset>
    </ActionDialog>
  );
}

export default function OwnerRulesSection() {
  const ws = getWorkspaceId() ?? "";
  const admin = usePolicyPermission("iga:admin");
  const rules = useListGovOwnerRulesQuery({ ws });
  const [del] = useDeleteGovOwnerRuleMutation();
  const delAction = usePolicyAction("iga:admin");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GovOwnerRule | null>(null);
  const failure = classifyPolicyError(rules.error);
  const rows = rules.data?.data ?? [];

  async function remove() {
    if (!removing) return;
    const res = await delAction.run(() => del({ id: removing.id }));
    if (res) setRemoving(null);
  }

  return (
    <Panel
      title="Owner rules"
      description="Assign owners from an AWS tag. A change to a role cannot go to owner review until the role has an accountable owner."
      actions={admin.offered ? <Button onClick={() => setAdding(true)}>Add a rule…</Button> : undefined}
      flush
    >
      {rules.isLoading ? (
        <p role="status" className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !rules.data ? (
        <div className="px-4 py-3">
          {failure.kind === "forbidden" ? (
            <p className="text-[13px] text-(--color-text-muted)">Your role cannot see owner rules. They are for workspace administrators.</p>
          ) : (
            <PolicyLoadFailure failure={failure} subject="the owner rules" onRetry={() => void rules.refetch()} />
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-1 px-4 py-3 text-[13px]">
          <p className="font-medium text-(--color-text)">No owner rules.</p>
          <p className="text-(--color-text-muted)">Owners are assigned by hand on each role or workload.</p>
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-(--color-text)">
                  Tag <span className="font-mono">{r.tag_key}</span>
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  {APPLIES_LABEL[r.applies_to]} · {ROLE_LABEL[r.role]}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "On" : "Off"}</StatusBadge>
                {admin.offered ? (
                  <Button variant="outline" onClick={() => setRemoving(r)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rules.data?.meta.next_cursor ? <p className="px-4 pb-3 text-xs text-(--color-text-muted)">More rules exist than are shown here.</p> : null}
      <AddDialog open={adding} onOpenChange={setAdding} />
      <ActionDialog
        open={!!removing}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
        title="Delete this owner rule?"
        description={removing ? `The owners that tag ${removing.tag_key} assigned are removed with it. Owners added by hand stay.` : ""}
        confirmLabel="Delete rule"
        busyLabel="Deleting…"
        destructive
        pending={delAction.pending}
        failure={delAction.failure}
        onConfirm={() => void remove()}
      />
    </Panel>
  );
}
