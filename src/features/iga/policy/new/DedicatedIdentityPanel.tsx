import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCreateGovProposalMutation, type GovBindingKind } from "@/app/api/igaPolicyAuthoringApi";
import { useResolveGovTargetsQuery } from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";
import { PolicyActionError, usePolicyAction } from "../shared";
import { keyOfText } from "./entry";

const kinds: Record<string, GovBindingKind> = {
  lambda_function: "lambda_role",
  ecs_task_definition: "ecs_task_role",
  ec2_instance: "ec2_instance_profile",
};

/** A separate authoring intent using the same policy, review and delivery lifecycle. */
export function DedicatedIdentityPanel() {
  const navigate = useNavigate();
  const [role, setRole] = useState("");
  const [checked, setChecked] = useState("");
  const [workload, setWorkload] = useState("");
  const [binding, setBinding] = useState("");
  const [name, setName] = useState("");
  const [delivery, setDelivery] = useState<"export" | "iac_pr">("export");
  const action = usePolicyAction("governance:author");
  const [create] = useCreateGovProposalMutation();
  const key = keyOfText(checked);
  const query = useResolveGovTargetsQuery({ ws: getWorkspaceId() ?? "", keys: key ? [key] : [] }, { skip: !key });
  const target = query.currentData?.[0];
  const consumers = (target?.consumers ?? []).filter(c => c.relationship === "executes_as" && kinds[c.runtime_kind]);
  const selected = consumers.find(c => c.workload_id === workload);
  const controlled = target?.control;
  const canCreate = target?.status === "resolved" && target.eligible && !controlled && selected && binding.trim() && name.trim();
  return (
    <Panel title="Give a workload its own role" description="Separate a workload from a shared role without waiting for unused-access history.">
      <div className="space-y-4 text-sm">
        <p className="text-(--color-text-muted)">AuthSec copies the role’s identity policies, trust and boundary. Access granted elsewhere by role name needs review. Nothing is changed in AWS when you save the draft.</p>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); setChecked(role.trim()); setWorkload(""); setBinding(""); action.clear(); }}>
          <label className="min-w-0 flex-1 space-y-1"><span>Source role ARN or role id</span><Input value={role} onChange={e => setRole(e.target.value)} autoComplete="off" spellCheck={false} /></label>
          <Button type="submit" variant="outline" disabled={!keyOfText(role) || query.isFetching || action.pending}>{query.isFetching ? "Checking…" : "Find workloads"}</Button>
        </form>
        {query.isError ? <p role="alert">Could not load the role. <Button variant="link" onClick={() => query.refetch()}>Retry</Button></p> : null}
        {target && !query.isFetching ? <>
          {target.identity ? <p className="font-medium">Source role: {target.identity.name} · {target.identity.account_id}</p> : null}
          {controlled ? <p>This role already belongs to a policy. <Link className="text-(--color-primary-text) underline" to={`/iga/policy/policies/${controlled.policy_id}`}>Open that policy</Link> before creating another control.</p> : target.status !== "resolved" || !target.eligible ? <p role="status">This role cannot be used. {target.reason || target.ineligible_reasons?.join(", ")}</p> : consumers.length === 0 ? <p>No supported Lambda, ECS task-role or EC2 binding was found. Task execution roles are separate from workload identities.</p> : <form className="space-y-3" onSubmit={async e => {
            e.preventDefault();
            if (!key || !selected || !canCreate) return;
            const result = await action.run(() => create({ template: "dedicated_identity", keys: [key], delivery,
              isolation: { workload: { workload_id: selected.workload_id, binding_kind: kinds[selected.runtime_kind], binding_ref: binding.trim() }, role_name: name.trim(), role_path: "/" } }));
            if (result) navigate(`/iga/policy/policies/${result.data.policy.id}`);
          }}>
            <label className="block space-y-1"><span>Workload to move</span><select className="h-10 w-full rounded-md border border-(--color-border-subtle) bg-(--color-background) px-3" required value={workload} onChange={e => { setWorkload(e.target.value); setBinding(""); }}><option value="">Choose a workload</option>{consumers.map(c => <option key={c.workload_id} value={c.workload_id}>{c.name} · {c.runtime_kind}</option>)}</select></label>
            {selected ? <>
              <label className="block space-y-1"><span>{selected.runtime_kind === "ecs_task_definition" ? "ECS service ARN" : selected.runtime_kind === "lambda_function" ? "Lambda function ARN" : "EC2 instance ARN"}</span><Input required value={binding} onChange={e => setBinding(e.target.value)} spellCheck={false} /></label>
              {selected.runtime_kind === "ecs_task_definition" ? <p className="text-xs text-(--color-text-muted)">The plan covers all services running this task family with the source role. Review that scope before approval.</p> : null}
              <label className="block space-y-1"><span>New IAM role name</span><Input required maxLength={64} value={name} onChange={e => setName(e.target.value)} spellCheck={false} /></label>
              <label className="block space-y-1"><span>Delivery after review and approval</span><select className="h-10 w-full rounded-md border border-(--color-border-subtle) bg-(--color-background) px-3" value={delivery} onChange={e => setDelivery(e.target.value as "export" | "iac_pr")}><option value="export">Export for your infrastructure workflow</option><option value="iac_pr">Pull request to a configured repository</option></select></label>
              <p className="text-xs text-(--color-text-muted)">The server checks current AWS bindings and role documents. Open the saved draft to review it and request owner review; creating it does not apply a change.</p>
              <Button type="submit" disabled={!canCreate || action.pending}>{action.pending ? "Checking AWS and saving…" : "Create dedicated-identity draft"}</Button>
            </> : null}
          </form>}
        </> : null}
        <PolicyActionError failure={action.failure} />
      </div>
    </Panel>
  );
}
