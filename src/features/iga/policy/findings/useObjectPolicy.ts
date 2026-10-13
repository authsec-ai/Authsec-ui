/**
 * Whether an object is already controlled by a policy, and by which
 * (SPEC-iga-phase3-policy.md §9.4). The server answers it: the object id goes
 * to `POST /targets/resolve` and the controlling policy, if any, comes back
 * with it. Nothing is derived from a loaded row, a table page or a graph.
 *
 * The same request the findings panel makes, so on a page that has both it is
 * one read. `skip` keeps every caller that is not on screen from asking.
 */

import { useGetGovPolicyQuery } from "@/app/api/igaPolicyAuthoringApi";
import { govTargetKeyForObject, useResolveGovTargetsQuery, type GovControlRef, type GovResolvedTarget } from "@/app/api/igaPolicyReadsApi";

export interface ObjectPolicy {
  /** The resolve answer for the object; null until it arrives or when skipped. */
  target: GovResolvedTarget | null;
  /** The control on the role, when a policy holds it. */
  control: GovControlRef | null;
  /** That policy's name; null while it loads or when there is none. */
  policyName: string | null;
  loading: boolean;
}

export function useObjectPolicy(ws: string, objectId: string, skip: boolean): ObjectPolicy {
  const off = skip || !ws || !objectId;
  const resolved = useResolveGovTargetsQuery({ ws, keys: [govTargetKeyForObject(objectId)] }, { skip: off });
  const target = resolved.data?.[0] ?? null;
  const control = target?.control ?? null;
  const policy = useGetGovPolicyQuery({ ws, policyId: control?.policy_id ?? "" }, { skip: off || !control });
  return { target, control, policyName: policy.data?.name ?? null, loading: !off && resolved.isLoading };
}
