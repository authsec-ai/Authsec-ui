/**
 * "Create policy" on a Discovery object page (SPEC-iga-phase3-policy.md §9.4).
 * It asks the server to resolve the object (`POST /targets/resolve`, a read)
 * when clicked, never from a list row, and then either opens the new-policy
 * flow or says in words why it cannot: not supported (with the prerequisite),
 * not eligible, already controlled (with a link to that policy) or evidence
 * that is not trusted (with a link to the connection).
 *
 * Once the server has said a policy already controls the role, the button
 * becomes **Edit <policy name>** and goes straight to that policy, so nobody
 * clicks a create button to be told it cannot create (§9.4).
 *
 * Renders nothing while the policy product is off.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  govTargetKeyForObject,
  useLazyResolveGovTargetsQuery,
  type GovResolvedTarget,
} from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { useObjectPolicy } from "./useObjectPolicy";

import { POLICY_ERROR_COPY, PolicyLoadFailure, classifyPolicyError, humanize, trust, usePolicyCapabilities, type PolicyFailure } from "../shared";
import { coverageHrefFor, trustReasonWords } from "./findingModel";

const INELIGIBLE: Record<string, string> = {
  not_a_role: "It is not an IAM role.",
  no_immutable_role_id: "AuthSec has no stable AWS role id for it.",
  service_linked_role: "It is a service-linked role, which AWS manages.",
  aws_reserved_role: "It is an AWS-reserved role.",
  authsec_protected: "It is tagged authsec:protected.",
  authsec_managed_role: "AuthSec manages this role itself.",
};

const NOT_FOUND: Record<string, string> = {
  account_mismatch: "It belongs to an account that is not connected.",
  no_live_identity: "AuthSec has no live IAM role for it in the latest scan.",
  workload_runs_as_no_role: "This workload does not run as an IAM role AuthSec knows.",
  identity_retired: "The role it pointed to no longer exists.",
};

export function CreatePolicyAction({
  objectId,
  label = "Create policy",
  className,
  size,
  variant,
  lazy,
}: {
  objectId: string;
  label?: string;
  className?: string;
  size?: "sm";
  variant?: "outline";
  /** Ask the server only when clicked, for rows that would otherwise each make a request. Never shows "Edit <policy>" up front. */
  lazy?: boolean;
}) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const held = useObjectPolicy(ws, objectId, caps.state !== "on" || !!lazy);
  const navigate = useNavigate();
  const [resolve, { isFetching }] = useLazyResolveGovTargetsQuery();
  const [answer, setAnswer] = useState<GovResolvedTarget | null>(null);
  const [failure, setFailure] = useState<PolicyFailure | null>(null);

  if (caps.state !== "on" || !objectId) return null;

  if (held.control) {
    return (
      <Button asChild size={size} variant={variant} className={cn(variant ? "" : "text-white", className)}>
        <Link to={`/iga/policy/policies/${encodeURIComponent(held.control.policy_id)}`}>{held.policyName ? `Edit ${held.policyName}` : "Edit policy"}</Link>
      </Button>
    );
  }

  const click = async () => {
    setAnswer(null);
    setFailure(null);
    const r = await resolve({ ws, keys: [govTargetKeyForObject(objectId)] }, false);
    if (r.error) {
      setFailure(classifyPolicyError(r.error));
      return;
    }
    const t = r.data?.[0];
    if (!t) {
      setFailure({ kind: "failed", code: "", message: "The server returned no answer for this object.", detail: {} });
      return;
    }
    if (t.status === "resolved" && t.eligible && !t.control && t.evidence?.trust !== "untrusted") {
      navigate(`/iga/policy/new?object=${encodeURIComponent(objectId)}`);
      return;
    }
    setAnswer(t);
  };

  return (
    <div className="inline-flex max-w-full flex-col items-end gap-2 text-left">
      <Button onClick={() => void click()} disabled={isFetching} size={size} variant={variant} className={cn(variant ? "" : "text-white", className)}>
        {isFetching ? "Checking…" : label}
      </Button>
      {failure ? (
        <div className="max-w-sm">
          <PolicyLoadFailure failure={failure} subject="this object" onRetry={() => void click()} />
        </div>
      ) : null}
      {answer ? <Explanation t={answer} /> : null}
    </div>
  );
}

function Explanation({ t }: { t: GovResolvedTarget }) {
  let body: React.ReactNode;
  if (t.status === "not_supported") {
    body = (
      <>
        <p className="font-medium">Not yet supported for policy.</p>
        <p>
          {t.prerequisite ? `It needs ${t.prerequisite}: authenticated, ordered collection from this cluster. ` : ""}
          {t.reason && !t.reason.startsWith("provider_not_supported") ? humanize(t.reason) : ""}
        </p>
      </>
    );
  } else if (t.status === "not_found") {
    body = (
      <>
        <p className="font-medium">AuthSec cannot find a role to change.</p>
        <p>{(t.reason && NOT_FOUND[t.reason]) ?? "The object did not resolve to an IAM role."}</p>
      </>
    );
  } else if (t.status === "ambiguous") {
    body = (
      <>
        <p className="font-medium">More than one role matches.</p>
        <p>Open the role itself and create the policy from there.</p>
      </>
    );
  } else if (t.control) {
    body = (
      <>
        <p className="font-medium">{POLICY_ERROR_COPY.role_controlled_by_policy.title}.</p>
        <p>
          <Link to={`/iga/policy/policies/${encodeURIComponent(t.control.policy_id)}`} className="font-medium underline">
            Edit that policy
          </Link>
        </p>
      </>
    );
  } else if (!t.eligible) {
    body = (
      <>
        <p className="font-medium">This role cannot be changed by policy.</p>
        <ul className="list-disc pl-4">
          {t.ineligible_reasons.map((r) => (
            <li key={r}>{INELIGIBLE[r] ?? humanize(r)}</li>
          ))}
        </ul>
      </>
    );
  } else {
    const ev = t.evidence;
    body = (
      <>
        <p className="font-medium">AuthSec cannot propose a change from this evidence ({trust(ev?.trust).label.toLowerCase()}).</p>
        {ev && ev.trust_reasons.length > 0 ? <p>{ev.trust_reasons.map(trustReasonWords).join("; ")}.</p> : null}
        <p>
          <Link to={coverageHrefFor(ev?.connector_id)} className="font-medium underline">
            Open Connections
          </Link>
        </p>
      </>
    );
  }
  return (
    <div role="status" className="max-w-sm space-y-1 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text)">
      {body}
    </div>
  );
}
