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
import { IDENTITY_KIND_LABEL, accountLabel } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { viaLink } from "../shared/links";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { Panel } from "../shared/components/Panel";
import { WrapId } from "../shared/components/WrapId";

const MECHANISM_LABEL: Record<string, string> = {
  sts_assume_role: "AssumeRole",
  oidc_federation: "OIDC federation",
  saml_federation: "SAML federation",
  assume_role_with_web_identity: "Web identity",
  assume_role_with_saml: "SAML",
};

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
              {p.principal.name}
            </Link>
          ) : (
            <span className="text-[13px] font-medium text-(--color-text)">{p.principal.name}</span>
          )}
          <span className="ml-2 text-xs text-(--color-text-muted)">
            {kind}
            {p.principal.account ? ` · ${accountLabel(p.principal.account)}` : ""} · {mechanism(p.mechanism)}
          </span>
          {p.principal.arn ? (
            <p className="mt-0.5 font-mono text-xs leading-5 text-(--color-text-muted)">
              <WrapId>{p.principal.arn}</WrapId>
            </p>
          ) : null}
        </div>
        <ClaimFacts claim={p.claim} basis={p.basis} state={p.state} confirmedAt={p.last_confirmed_at} />
      </div>
      {p.conditions ? (
        <p className="text-xs text-(--color-warning-text)">The trust statement sets conditions, which were not evaluated.</p>
      ) : null}
      {p.statement.negated ? (
        <p className="text-xs text-(--color-warning-text)">It uses NotPrincipal, so who it admits could not be resolved.</p>
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
      title="Who can assume this role"
      flush
      count={section ? `${section.total ?? section.items.length}${section.next_cursor ? "+" : ""}` : undefined}
      description="From the role's trust policy. Not evaluated."
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
        <p className="px-4 py-3 text-sm text-(--color-text-muted)">No principal is named in this role's trust policy.</p>
      )}
    </Panel>
  );
}
