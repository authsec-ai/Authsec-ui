/**
 * Identities — what the workload runs as, and who else does (§2.14.6).
 *
 * An empty execution section is read from `execution_role_state`, never
 * inferred from a missing relationship: "no role configured", "a role we do
 * not hold" and "a role the scan did not read" are three different findings
 * (§2.14.7).
 */

import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphWorkloadIdentitiesQuery,
  useLazyGetGraphWorkloadIdentitiesQuery,
  type AssumeRelationship,
  type IdentityRelationship,
  type WorkloadDetail,
  type WorkloadIdentities,
  type WorkloadIdentitySection,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";

import { classifyGraphError } from "../shared/graphErrors";
import { RELATIONSHIP_LABEL, countText } from "../shared/labels";
import { emptyGiven } from "../shared/listSummary";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { viaLink } from "../shared/links";
import { IdentityName } from "../shared/components/IdentityName";
import { ClaimRow } from "../shared/components/Panel";
import { TabBody } from "../shared/components/ObjectShell";
import { CoverageSummary } from "../coverage/CoverageSummary";
import { SectionList } from "../shared/components/SectionList";

type From = { ref: WorkloadDetail["ref"]; name: string };

function RelationshipBody({ rel, from }: { rel: IdentityRelationship; from: From }) {
  const shared = rel.used_by_count && (rel.used_by_count.value ?? 0) > 1 ? rel.used_by_count : null;
  const usedBy = objectPath(rel.identity.ref);
  return (
    <ClaimRow
      eyebrow={rel.type !== "executes_as" ? RELATIONSHIP_LABEL[rel.type] ?? rel.type : undefined}
      title={<IdentityName identity={rel.identity} from={from} />}
      facts={<ClaimFacts claim={rel.claim} basis={rel.basis} state={rel.state} confirmedAt={rel.last_confirmed_at} />}
    >
      {shared && usedBy ? (
        <p className="text-xs text-(--color-info-text)">
          {countText(shared, "workload", "workloads")} run as this identity. Changing it affects all of them.{" "}
          <Link {...viaLink(`${usedBy}/used-by`, from)} className="font-semibold hover:underline">
            See which
          </Link>
        </p>
      ) : null}
    </ClaimRow>
  );
}

function AssumeBody({ rel, from }: { rel: AssumeRelationship; from: From }) {
  return (
    <ClaimRow
      title={<IdentityName identity={rel.target} from={from} />}
      facts={<ClaimFacts claim={rel.claim} basis={rel.basis} state={rel.state} confirmedAt={rel.last_confirmed_at} />}
    >
      <p className="text-xs leading-relaxed text-(--color-text-muted)">
        The role's trust policy {rel.statement.sid ? `(statement ${rel.statement.sid}) ` : ""}names this workload's
        identity as a principal. The caller's own sts:AssumeRole permission was not checked.
        {rel.conditions ? " The trust policy also sets conditions, which were not evaluated." : ""}
        {rel.statement.negated ? " It uses NotPrincipal, so who it admits could not be resolved." : ""}
      </p>
    </ClaimRow>
  );
}

function executionEmpty(data: WorkloadIdentities): string {
  const arn = data.execution_role_arn;
  switch (data.execution_role_state) {
    case "none":
      return "No execution role configured.";
    case "not_in_inventory":
      return `Runs as ${arn ?? "a role"} — matches no identity in any connected account.`;
    case "not_in_scan":
      return `Runs as ${arn ?? "a role"} — not read in the latest scan. The account's coverage says why.`;
    default:
      return "The execution identity could not be shown.";
  }
}

export function WorkloadIdentitiesTab({ ws, workload }: { ws: string; workload: WorkloadDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh, markStale } = useGraphRevision(ws);
  const args = { ws, rev, key: String(epoch), id: refId(workload.ref) };
  const q = useGetGraphWorkloadIdentitiesQuery(args);
  const [fetchSection] = useLazyGetGraphWorkloadIdentitiesQuery();
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphWorkloadIdentities", { ...args, rev: r }, d)),
  );
  const data = q.currentData?.data;
  const from: From = { ref: workload.ref, name: workload.name };

  /** The page after `cursor` of one section, at the pinned revision. */
  const more =
    <K extends WorkloadIdentitySection>(section: K) =>
    async (cursor: string) =>
      (await fetchSection({ ...args, section, cursor }).unwrap()).data[section] as NonNullable<WorkloadIdentities[K]>;
  const onStale = (f: { currentRev?: number; currentPublishedAt?: string }) => markStale(f);
  const none = { items: [], next_cursor: null, total_known: true, total: 0 };
  const coverage = q.currentData?.meta.coverage ?? [];

  return (
    <TabBody ready={!!data} failure={failure} subject="identities" onRetry={() => void q.refetch()} onRefresh={refresh}>
      {data ? (
        <div className="space-y-4">
          {coverage.length ? <CoverageSummary subject="identities" ws={ws} gaps={coverage} accountName={(id) => id} /> : null}
          <SectionList
            label="Execution identity"
            first={data.execution ?? none}
            loadMore={more("execution")}
            onStale={onStale}
            itemKey={(r) => r.claim}
            render={(r) => <RelationshipBody rel={r} from={from} />}
            empty={
              <span className="text-(--color-text)">{executionEmpty(data)}</span>
            }
          />
          <SectionList
            label="Other roles it is configured with"
            first={data.other ?? none}
            loadMore={more("other")}
            onStale={onStale}
            itemKey={(r) => r.claim}
            render={(r) => <RelationshipBody rel={r} from={from} />}
            empty={null}
          />
          <SectionList
            label="Groups its identity is a member of"
            first={data.groups ?? none}
            loadMore={more("groups")}
            onStale={onStale}
            itemKey={(r) => r.claim}
            render={(r) => <RelationshipBody rel={r} from={from} />}
            empty={null}
          />
          <SectionList
            label="Roles its identity may assume"
            first={data.may_assume ?? none}
            loadMore={more("may_assume")}
            onStale={onStale}
            itemKey={(r) => r.claim}
            render={(r) => <AssumeBody rel={r} from={from} />}
            empty={null}
          />
          {data.execution?.items.length &&
          !data.other?.items.length &&
          !data.groups?.items.length &&
          !data.may_assume?.items.length ? (
            <p className="text-xs text-(--color-text-muted)">
              {emptyGiven("No other role, group or assumable role is declared for this workload's identity.", coverage)}
            </p>
          ) : null}
        </div>
      ) : null}
    </TabBody>
  );
}
