/**
 * "Who can assume this role?" — the inbound side of the workload's identity.
 *
 * The workload's own routes only say what its identity may assume (outbound).
 * Who may assume IT is the role's trust policy, which lives on the identity's
 * Used by route; this reads the principals section of that route.
 *
 * Trust policies are recorded as structured rows, not evaluated: a condition is
 * shown as "set", never as satisfied, and a NotPrincipal statement is said to
 * be unresolvable rather than guessed.
 */

import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphIdentityUsedByQuery,
  type GraphRef,
  type UsedByPrincipal,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";

import { classifyGraphError } from "../shared/graphErrors";
import { IDENTITY_KIND_HINT, IDENTITY_KIND_LABEL, accountPhrase } from "../shared/labels";
import { servicePlain } from "../shared/access";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { viaLink } from "../shared/links";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { Panel } from "../shared/components/Panel";
import { WrapId } from "../shared/components/WrapId";

const MECHANISM_LABEL: Record<string, string> = {
  sts_assume_role: "can borrow this role",
  oidc_federation: "signs in through an OIDC provider",
  saml_federation: "signs in through a SAML provider",
  assume_role_with_web_identity: "signs in with a web identity",
  assume_role_with_saml: "signs in with SAML",
};

/** "lambda.amazonaws.com" reads as "Lambda (functions) service"; anything else is shown as it is. */
function principalName(kind: string, name: string): string {
  const m = /^([a-z0-9-]+)\.amazonaws\.com$/.exec(name);
  return kind === "aws_service" && m ? `${servicePlain(m[1])} service` : name;
}

function mechanism(m: string): string {
  return MECHANISM_LABEL[m] ?? m.replace(/_/g, " ");
}

function Principal({ p, from }: { p: UsedByPrincipal; from: { ref: GraphRef; name: string } }) {
  const path = objectPath(p.principal.ref);
  const kind = IDENTITY_KIND_LABEL[p.principal.kind as keyof typeof IDENTITY_KIND_LABEL] ?? p.principal.kind.replace(/_/g, " ");
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5">
        <div className="min-w-0">
          {path ? (
            <Link {...viaLink(path, from)} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
              {principalName(p.principal.kind, p.principal.name)}
            </Link>
          ) : (
            <span className="text-[13px] font-medium text-(--color-text)">{principalName(p.principal.kind, p.principal.name)}</span>
          )}
          <span className="ml-2 text-xs text-(--color-text-muted)">
            <span title={IDENTITY_KIND_HINT[p.principal.kind as keyof typeof IDENTITY_KIND_HINT]}>{kind}</span>
            {p.principal.account ? ` · in ${accountPhrase(p.principal.account)}` : ""} · {mechanism(p.mechanism)}
          </span>
          {p.principal.arn ? (
            <p className="mt-0.5 text-xs leading-5 text-(--color-text-muted)">
              Unique AWS ID:{" "}
              <span className="font-mono">
                <WrapId>{p.principal.arn}</WrapId>
              </span>
            </p>
          ) : null}
        </div>
        <ClaimFacts claim={p.claim} basis={p.basis} state={p.state} confirmedAt={p.last_confirmed_at} />
      </div>
      {p.conditions ? (
        <p className="text-xs text-(--color-warning-text)">This rule only applies when extra conditions are met. AuthSec shows the conditions but has not checked them.</p>
      ) : null}
      {p.statement.negated ? (
        <p className="text-xs text-(--color-warning-text)">This rule says who is NOT allowed, so AuthSec cannot list who is allowed.</p>
      ) : null}
    </li>
  );
}

export function TrustCard({ ws, identity, from }: { ws: string; identity: GraphRef; from: { ref: GraphRef; name: string } }) {
  const dispatch = useAppDispatch();
  const { rev, epoch } = useGraphRevision(ws);
  const id = refId(identity);
  // Same arguments as the Identity page's own Used by tab for this section.
  const args = { ws, rev, key: String(epoch), id, section: "principals" as const };
  const q = useGetGraphIdentityUsedByQuery(args, { skip: rev == null });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentityUsedBy", { ...args, rev: r }, d)),
  );
  const section = q.currentData?.data.principals;
  const identityPath = objectPath(identity);

  return (
    <Panel
      title="Who can use this role"
      flush
      count={section ? `${section.total ?? section.items.length}${section.next_cursor ? "+" : ""}` : undefined}
      description="The people and services this role trusts, as written in AWS. AuthSec has not checked the extra conditions."
    >
      {failure ? (
        <p className="px-4 py-3 text-sm text-(--color-text-muted)">
          Could not read the trust policy.{" "}
          <button type="button" onClick={() => void q.refetch()} className="font-medium text-(--color-primary-text) hover:underline">
            Retry
          </button>
        </p>
      ) : !q.currentData ? (
        <div className="p-4" aria-busy="true" aria-label="Loading trust">
          <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" />
        </div>
      ) : section?.items.length ? (
        <>
          <ul className="divide-y divide-(--color-border-subtle)">
            {section.items.map((p) => (
              <Principal key={p.claim} p={p} from={from} />
            ))}
          </ul>
          {section.next_cursor && identityPath ? (
            <p className="border-t border-(--color-border-subtle) px-4 py-2.5 text-xs text-(--color-text-muted)">
              More principals are named than this shows.{" "}
              <Link {...viaLink(`${identityPath}/used-by`, from)} className="font-medium text-(--color-primary-text) hover:underline">
                See all
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-(--color-text-muted)">This role does not name anyone who may use it.</p>
      )}
    </Panel>
  );
}
