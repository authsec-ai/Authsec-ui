/**
 * Rename a policy and change its purpose in place (`PATCH /policies/:id`,
 * iga_gov_authoring_controller.go:244). The server accepts only `name`,
 * `purpose` and `owner_user_id` and rejects any other member, so exactly the
 * changed members are sent. A name already in use is refused 409
 * policy_name_taken and shown inline.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import { usePatchGovPolicyMutation, type GovPolicyPatch, type GovPolicyView } from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PolicyActionError, usePolicyAction } from "../shared";

export function PolicyIdentityEdit({ policy, onDone }: { policy: GovPolicyView; onDone: () => void }) {
  const [patch] = usePatchGovPolicyMutation();
  const act = usePolicyAction("governance:author");
  const [name, setName] = useState(policy.name);
  const [purpose, setPurpose] = useState(policy.purpose);

  const body: GovPolicyPatch = {};
  if (name.trim() !== policy.name) body.name = name.trim();
  if (purpose.trim() !== policy.purpose) body.purpose = purpose.trim();
  const changed = Object.keys(body).length > 0;

  async function save() {
    const res = await act.run(() => patch({ policyId: policy.id, patch: body }));
    if (res) {
      toast.success("Policy updated");
      onDone();
    }
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && name.trim() !== "") void save();
      }}
    >
      <label className="block text-xs text-(--color-text-muted)">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" maxLength={200} autoFocus />
      </label>
      <label className="block text-xs text-(--color-text-muted)">
        Purpose
        <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} className="mt-1" placeholder="Why this policy exists" />
      </label>
      <PolicyActionError failure={act.failure} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="text-white" disabled={act.pending || !changed || name.trim() === ""}>
          {act.pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={act.pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
